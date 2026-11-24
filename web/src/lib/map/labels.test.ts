import { describe, expect, it } from 'vitest';
import { geoEqualEarth } from 'd3-geo';
import type { Feature, Polygon } from 'geojson';
import polylabel from 'polylabel';
import {
	borderDistance,
	centralPole,
	computeAnchor,
	dotOutgrowsCountry,
	PLACEMENT_MIN_FRACTION,
	fontSize,
	placeDots,
	placeLabelBoxes,
	placeLabels,
	type Anchor,
	type LabelItem
} from './labels.js';

const square = (lon: number, lat: number, size: number): Feature<Polygon> => ({
	type: 'Feature',
	properties: {},
	geometry: {
		type: 'Polygon',
		coordinates: [
			[
				[lon, lat],
				[lon, lat + size],
				[lon + size, lat + size],
				[lon + size, lat],
				[lon, lat]
			]
		]
	}
});

const anchor = (iso: string, x: number, y: number, r: number, area = r * r * 4): Anchor => ({
	iso,
	x,
	y,
	r,
	area
});

const item = (a: Anchor, width = 40, height = 14): LabelItem => ({
	iso: a.iso,
	anchor: a,
	width,
	height
});

const vp = { width: 1000, height: 600 };
const identity = { k: 1, x: 0, y: 0 };

describe('computeAnchor', () => {
	it('places the anchor inside the polygon with a positive radius', () => {
		const projection = geoEqualEarth().fitSize([1000, 600], square(0, 0, 40));
		const a = computeAnchor('XX', square(0, 0, 40), projection)!;
		const [x0, y0] = projection([0, 40])!;
		const [x1, y1] = projection([40, 0])!;
		expect(a.x).toBeGreaterThan(x0);
		expect(a.x).toBeLessThan(x1);
		expect(a.y).toBeGreaterThan(y0);
		expect(a.y).toBeLessThan(y1);
		expect(a.r).toBeGreaterThan(50);
		expect(a.area).toBeGreaterThan(0);
	});

	it('gives a country smaller than a pixel room in proportion to its size', () => {
		// 0.01° across: about 0.03 px at this scale, yet its word must fit once zoomed in
		const projection = geoEqualEarth().fitSize([1000, 600], square(0, 0, 40));
		const tiny = square(10, 10, 0.01);
		const a = computeAnchor('TI', tiny, projection)!;
		const [x0, y0] = projection([10, 10.01])!;
		const [x1, y1] = projection([10.01, 10])!;
		expect(a.x).toBeGreaterThan(x0);
		expect(a.x).toBeLessThan(x1);
		expect(a.y).toBeGreaterThan(y0);
		expect(a.y).toBeLessThan(y1);
		// the inscribed circle of a square has a radius of half its side
		expect(a.r).toBeGreaterThan(((x1 - x0) / 2) * 0.8);
	});

	it('uses the largest part of a multi-polygon country', () => {
		const projection = geoEqualEarth();
		const big = square(0, 0, 20).geometry.coordinates;
		const small = square(60, 0, 2).geometry.coordinates;
		const feature: Feature = {
			type: 'Feature',
			properties: {},
			geometry: { type: 'MultiPolygon', coordinates: [small, big] }
		};
		const a = computeAnchor('XX', feature, projection)!;
		const [bx] = projection([10, 10])!;
		expect(Math.abs(a.x - bx)).toBeLessThan(40);
	});
});

describe('placeLabels', () => {
	it('hides labels larger than their country', () => {
		const tiny = anchor('TI', 100, 100, 3);
		const big = anchor('BG', 500, 300, 80);
		const shown = placeLabels([item(tiny), item(big)], identity, vp);
		expect(shown.has('BG')).toBe(true);
		expect(shown.has('TI')).toBe(false);
	});

	it('shows small-country labels once zoomed in enough', () => {
		const tiny = anchor('TI', 100, 100, 3);
		const t = { k: 10, x: -500, y: -500 }; // anchor at screen (500, 500)
		expect(placeLabels([item(tiny)], t, vp).has('TI')).toBe(true);
	});

	it('resolves collisions in favour of the larger country', () => {
		const large = anchor('LG', 200, 200, 60, 50000);
		const small = anchor('SM', 210, 202, 40, 3000);
		const shown = placeLabels([item(small), item(large)], identity, vp);
		expect([...shown]).toEqual(['LG']);
	});

	it('skips labels outside or partly outside the viewport', () => {
		const off = anchor('OF', 2000, 300, 80);
		const edge = anchor('ED', 995, 300, 80);
		expect(placeLabels([item(off), item(edge)], identity, vp).size).toBe(0);
	});
});

describe('fontSize', () => {
	it('starts at 11px and is capped', () => {
		expect(fontSize(1)).toBe(11);
		expect(fontSize(4)).toBeGreaterThan(11);
		expect(fontSize(1000)).toBe(17);
	});
});

describe('placeDots', () => {
	const dotsFor = (items: LabelItem[], t = identity) => {
		const { visible, boxes } = placeLabelBoxes(items, t, vp);
		return { visible, dots: placeDots(items, visible, boxes, t, vp) };
	};

	it('marks countries whose label is hidden, not those whose label is shown', () => {
		const big = anchor('BG', 300, 300, 100);
		const tiny = anchor('TI', 700, 300, 2);
		const { visible, dots } = dotsFor([item(big), item(tiny)]);
		expect(visible.has('BG')).toBe(true);
		expect(dots.has('BG')).toBe(false);
		expect(dots.has('TI')).toBe(true);
	});

	it('skips anchors that are off screen', () => {
		expect(
			dotsFor([item(anchor('OF', -20, 300, 2)), item(anchor('ED', 2, 300, 2))]).dots.size
		).toBe(0);
	});

	it('never covers a shown label', () => {
		const big = anchor('BG', 300, 300, 100);
		const under = anchor('UN', 305, 300, 1); // sits inside BG's label box
		expect(dotsFor([item(big), item(under)]).dots.has('UN')).toBe(false);
	});

	it('thins out crowded dots, keeping the larger country', () => {
		const a = anchor('AA', 500, 300, 2, 50);
		const b = anchor('BB', 504, 300, 2, 10);
		const far = anchor('CC', 600, 300, 2, 5);
		const { dots } = dotsFor([item(b), item(a), item(far)]);
		expect([...dots].sort()).toEqual(['AA', 'CC']);
	});

	it('is deterministic regardless of input order', () => {
		const xs = [anchor('AA', 500, 300, 2, 10), anchor('BB', 503, 300, 2, 10)].map((a) => item(a));
		expect([...dotsFor(xs).dots]).toEqual([...dotsFor([...xs].reverse()).dots]);
	});
});

describe('centralPole', () => {
	type Ring = [number, number][];
	// long, even band (screen coords, y down) with a slight bulge near the right end that makes
	// the plain pole of inaccessibility jump there
	const band: Ring = [
		[0, 0],
		[85, 0],
		[90, -1.2],
		[95, 0],
		[100, 0],
		[100, 10],
		[0, 10]
	];
	// a big square with a long thin tail: the centroid lies in the tail, the room in the square
	const keyhole: Ring = [
		[0, 0],
		[40, 0],
		[40, 15],
		[140, 15],
		[140, 25],
		[40, 25],
		[40, 40],
		[0, 40]
	];

	it('centres the label in a long, even shape', () => {
		expect(polylabel([band], 0.5)[0]).toBeGreaterThan(80);
		expect(centralPole(band).x).toBeGreaterThan(40);
		expect(centralPole(band).x).toBeLessThan(60);
	});

	it('stays in a clearly wider region', () => {
		const p = centralPole(keyhole);
		expect(p.x).toBeLessThan(40);
		expect(p.distance).toBeGreaterThanOrEqual(PLACEMENT_MIN_FRACTION * 20 - 0.5);
	});

	it('keeps enough room and reports the true distance to the border', () => {
		for (const ring of [band, keyhole]) {
			const p = centralPole(ring);
			const max = (polylabel([ring], 0.5) as number[] & { distance: number }).distance;
			expect(p.distance).toBeGreaterThan(0);
			expect(p.distance).toBeGreaterThanOrEqual(PLACEMENT_MIN_FRACTION * max);
			expect(p.distance).toBeCloseTo(borderDistance(p.x, p.y, ring), 6);
		}
	});

	it('gives the same result for either ring orientation', () => {
		const a = centralPole(keyhole);
		const b = centralPole([...keyhole].reverse());
		expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.5);
	});

	it('handles degenerate rings without throwing', () => {
		const line: Ring = [
			[0, 0],
			[10, 0],
			[20, 0]
		];
		expect(Number.isFinite(centralPole(line).x)).toBe(true);
	});

	it('measures border distance as negative outside the ring', () => {
		expect(borderDistance(-5, 20, keyhole)).toBeCloseTo(-5);
		expect(borderDistance(20, 20, keyhole)).toBeCloseTo(20);
	});

	it('does not depend on where the ring starts', () => {
		const rotated = [...keyhole.slice(3), ...keyhole.slice(0, 3)];
		const a = centralPole(keyhole);
		const b = centralPole(rotated);
		expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.5);
	});
});

describe('dotOutgrowsCountry', () => {
	// a dot with its halo is a circle of 4.25 px radius: about 56.7 px²
	it('is true while the country is smaller on screen than its dot', () => {
		expect(dotOutgrowsCountry(anchor('MT', 0, 0, 1, 10), 1)).toBe(true);
		expect(dotOutgrowsCountry(anchor('MT', 0, 0, 1, 10), 2.3)).toBe(true);
	});

	it('is false once zoomed in until the country is larger than its dot', () => {
		expect(dotOutgrowsCountry(anchor('MT', 0, 0, 1, 10), 2.4)).toBe(false);
		expect(dotOutgrowsCountry(anchor('FR', 0, 0, 50, 4000), 1)).toBe(false);
	});
});
