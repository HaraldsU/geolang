import { describe, expect, it } from 'vitest';
import { geoEqualEarth } from 'd3-geo';
import type { Feature, Polygon } from 'geojson';
import { computeAnchor, fontSize, placeLabels, type Anchor, type LabelItem } from './labels.js';

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
