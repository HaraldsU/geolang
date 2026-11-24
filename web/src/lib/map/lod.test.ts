import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { geoEqualEarth, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { FeatureCollection, Geometry } from 'geojson';
import {
	clippedProjection,
	covers,
	detailZoom,
	intersects,
	minWeight,
	prepare,
	renderExtent,
	simplifiedLayers,
	zoomBucket,
	type CountryTopology
} from './lod.js';
import { borderArcs } from './borders.js';

const topo: CountryTopology = JSON.parse(
	readFileSync(
		fileURLToPath(new URL('../../../static/world/countries-50m.json', import.meta.url)),
		'utf-8'
	)
);
const full = (feature(topo, topo.objects.countries) as FeatureCollection<Geometry>).features;
const projection = geoEqualEarth().fitExtent(
	[
		[20, 20],
		[1380, 830]
	],
	{ type: 'FeatureCollection', features: full }
);
const pre = prepare(topo);
const arcs = borderArcs(topo);
const simplifiedFeatures = (k: number) =>
	simplifiedLayers(pre, projection.scale(), k, arcs).countries;

function points(features: { geometry: Geometry }[], p = projection) {
	let n = 0;
	const ctx = {
		moveTo: () => n++,
		lineTo: () => n++,
		closePath() {},
		beginPath() {},
		arc() {}
	};
	const path = geoPath(p, ctx as unknown as CanvasRenderingContext2D);
	for (const f of features) path(f as never);
	return n;
}

describe('zoom buckets', () => {
	it('rounds down to powers of two', () => {
		expect([0.5, 1, 1.9, 2, 3.99, 4, 37].map(zoomBucket)).toEqual([1, 1, 1, 2, 2, 4, 32]);
	});
	it('renders one bucket finer than needed', () => {
		expect(detailZoom(1)).toBe(2);
		expect(detailZoom(5)).toBe(8);
	});
	it('needs finer detail (smaller triangles) when zoomed in', () => {
		expect(minWeight(200, 4)).toBeCloseTo(minWeight(200, 1) / 16);
	});
});

describe('simplified geometry', () => {
	const world = simplifiedFeatures(1);

	it('keeps every country, including tiny islands', () => {
		expect(world.map((f) => f.id)).toEqual(full.map((f) => (f as { id?: string }).id));
		for (const iso of ['NR', 'MV', 'SG', 'VA', 'MC', 'SM', 'LI', 'MT', 'BH']) {
			const f = world.find((c) => c.id === iso);
			expect(f, iso).toBeDefined();
			expect(geoPath(projection)(f!), iso).toBeTruthy();
		}
	});

	it('draws far fewer points at world view', () => {
		expect(points(world)).toBeLessThan(points(full as never) * 0.5);
	});

	it('approaches full detail when zoomed in', () => {
		const deep = simplifiedFeatures(16);
		expect(points(deep)).toBeGreaterThan(points(full as never) * 0.9);
	});

	it("draws only the given countries' borders on request", () => {
		const layers = simplifiedLayers(pre, projection.scale(), 1, arcs);
		const all = new Set(layers.countries.map((c) => c.id));
		expect(layers.solidOf(all)!.geometry.coordinates.length).toBe(arcs.solid.length);
		const fr = layers.solidOf(new Set(['FR']))!.geometry.coordinates;
		expect(fr.length).toBe(arcs.byCountry.get('FR')!.length);
		expect(fr.length).toBeGreaterThan(0);
		expect(layers.solidOf(new Set())).toBeNull();
	});

	it('also returns solid border lines and dashed disputed outlines', () => {
		const { solid, dashed } = simplifiedLayers(pre, projection.scale(), 1, arcs);
		expect(solid!.geometry.coordinates.length).toBe(arcs.solid.length);
		expect(dashed!.geometry.coordinates.length).toBe(arcs.dashed.length);
		expect(arcs.dashed.length).toBeGreaterThan(10);
	});

	it('shared borders stay identical between neighbours (topology preserved)', () => {
		// France and Spain share a border; simplified rings must still touch.
		const fr = world.find((c) => c.id === 'FR')!;
		const es = world.find((c) => c.id === 'ES')!;
		const coords = (g: Geometry): string[] =>
			JSON.stringify(g).match(/-?\d+\.\d+,-?\d+\.\d+/g) ?? [];
		const shared = coords(fr.geometry).filter((c) => coords(es.geometry).includes(c));
		expect(shared.length).toBeGreaterThan(5);
	});
});

describe('clipping to the viewport', () => {
	const view = { k: 16, x: 0, y: 0 };
	const [cx, cy] = projection([10, 50])!;
	view.x = 700 - cx * view.k;
	view.y = 425 - cy * view.k;

	it('does not clip below the clipping zoom', () => {
		expect(renderExtent({ k: 2, x: 0, y: 0 }, 1400, 850)).toBeNull();
	});

	it('clips to the viewport plus a margin when zoomed in', () => {
		const ext = renderExtent(view, 1400, 850)!;
		expect(covers(ext, view, 1400, 850)).toBe(true);
		// panning by half a screen is still covered, a 3x zoom-out is not
		expect(covers(ext, { ...view, x: view.x + 700 }, 1400, 850)).toBe(true);
		expect(covers(ext, { k: 4, x: 700 - cx * 4, y: 425 - cy * 4 }, 1400, 850)).toBe(false);
		// a gesture settling near where the geometry was built needn't rebuild it
		expect(covers(ext, view, 1400, 850, 0.5)).toBe(true);
		expect(covers(ext, { ...view, x: view.x + 701 }, 1400, 850, 0.5)).toBe(false);
		const deep = simplifiedFeatures(16);
		expect(points(deep, clippedProjection(geoEqualEarth, projection, ext))).toBeLessThan(
			points(deep) * 0.3
		);
	});
});

describe('intersects', () => {
	const a: [[number, number], [number, number]] = [
		[0, 0],
		[10, 10]
	];

	it('is true for overlapping or touching rectangles', () => {
		expect(
			intersects(a, [
				[5, 5],
				[20, 20]
			])
		).toBe(true);
		expect(
			intersects(a, [
				[10, 0],
				[20, 10]
			])
		).toBe(true);
	});

	it('is false for separate ones', () => {
		expect(
			intersects(a, [
				[11, 0],
				[20, 10]
			])
		).toBe(false);
		expect(
			intersects(a, [
				[0, -20],
				[10, -1]
			])
		).toBe(false);
	});
});
