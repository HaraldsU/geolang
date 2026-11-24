import { describe, expect, it } from 'vitest';
import {
	CACHE_MARGIN,
	MAX_CACHE_PIXELS,
	cacheRegion,
	deviceOffset,
	regionCovers,
	splitByTint,
	worthRecentring,
	type DeviceRect
} from './raster.js';

const W = 1600;
const H = 900;
/** The map's pannable area (WorldMap's translateExtent): a quarter screen beyond each edge. */
const EXTENT: [[number, number], [number, number]] = [
	[-W * 0.25, -H * 0.25],
	[W * 1.25, H * 1.25]
];

/** Is the viewport of `view` inside `r`? */
const holdsViewport = (r: DeviceRect, view: { k: number; x: number; y: number }, dpr = 1) =>
	regionCovers(r, deviceOffset(view, dpr), Math.ceil(W * dpr), Math.ceil(H * dpr));

describe('deviceOffset', () => {
	it('rounds the translation to whole device pixels', () => {
		expect(deviceOffset({ k: 3, x: 10.4, y: -7.6 }, 1)).toEqual([10, -8]);
		expect(deviceOffset({ k: 3, x: 10.4, y: -7.6 }, 2)).toEqual([21, -15]);
	});
});

describe('cacheRegion', () => {
	it('fully zoomed out, holds everything the map can be panned to', () => {
		for (const x of [0, -W * 0.25, W * 0.25]) {
			const r = cacheRegion({ k: 1, x, y: 0 }, W, H, 1, EXTENT)!;
			expect(r).toEqual({ x: -W * 0.25, y: -H * 0.25, w: W * 1.5, h: H * 1.5 });
		}
	});

	it('zoomed in, adds a margin on every side of the viewport', () => {
		const view = { k: 6, x: -3000, y: -1800 };
		const r = cacheRegion(view, W, H, 1, EXTENT)!;
		expect(r.w).toBe(Math.floor(W * (1 + 2 * CACHE_MARGIN)));
		expect(r.h).toBe(Math.floor(H * (1 + 2 * CACHE_MARGIN)));
		expect(r.x).toBe(3000 - (r.w - W) / 2);
		expect(r.y).toBe(1800 - (r.h - H) / 2);
		expect(holdsViewport(r, view)).toBe(true);
	});

	it('near the edge of the pannable area, puts the margin on the other side', () => {
		const k = 4;
		const view = { k, x: W * 0.25 * k, y: -1000 }; // as far left as the map can go
		const r = cacheRegion(view, W, H, 1, EXTENT)!;
		expect(r.x).toBe(-W * 0.25 * k);
		expect(r.w).toBe(Math.floor(W * (1 + 2 * CACHE_MARGIN)));
		expect(holdsViewport(r, view)).toBe(true);
	});

	it('shrinks the margin to stay within the bitmap size limit', () => {
		const view = { k: 6, x: -3000, y: -1800 };
		const r = cacheRegion(view, W, H, 3, EXTENT)!;
		expect(r.w * r.h).toBeLessThanOrEqual(MAX_CACHE_PIXELS);
		expect(r.w).toBeGreaterThan(W * 3);
		expect(holdsViewport(r, view, 3)).toBe(true);
	});

	it('gives up when the viewport alone is too large', () => {
		expect(cacheRegion({ k: 2, x: 0, y: 0 }, 5000, 4000, 1, EXTENT)).toBeNull();
	});

	it('always holds the viewport, even outside the pannable area', () => {
		const view = { k: 1, x: W, y: 0 };
		expect(holdsViewport(cacheRegion(view, W, H, 1, EXTENT)!, view)).toBe(true);
	});
});

describe('regionCovers', () => {
	const r = { x: -100, y: -50, w: 1200, h: 700 };

	it('is true exactly while the canvas lies inside the region', () => {
		// the region can slide 100px either way horizontally and 50px vertically
		expect(regionCovers(r, [100, 50], 1000, 600)).toBe(true);
		expect(regionCovers(r, [-100, -50], 1000, 600)).toBe(true);
		expect(regionCovers(r, [101, 0], 1000, 600)).toBe(false);
		expect(regionCovers(r, [-101, 0], 1000, 600)).toBe(false);
		expect(regionCovers(r, [0, 51], 1000, 600)).toBe(false);
		expect(regionCovers(r, [0, -51], 1000, 600)).toBe(false);
	});
});

describe('worthRecentring', () => {
	const cached = { x: -400, y: -225, w: 3200, h: 1800 }; // viewport 1600x900, margin 800x450

	it('not while the view is near where the cache was built', () => {
		expect(worthRecentring(cached, cached, W, H)).toBe(false);
		expect(worthRecentring(cached, { ...cached, x: cached.x + 399 }, W, H)).toBe(false);
	});

	it('once the view has used more than half of a margin', () => {
		expect(worthRecentring(cached, { ...cached, x: cached.x + 401 }, W, H)).toBe(true);
		expect(worthRecentring(cached, { ...cached, y: cached.y - 226 }, W, H)).toBe(true);
	});
});

describe('splitByTint', () => {
	const shapes = [
		{ id: 'A', d: 'M0,0Z' },
		{ id: 'B', d: 'M1,1Z' },
		{ id: 'C', d: 'M2,2Z' }
	];

	it('puts every country in exactly one of the two paths', () => {
		expect(splitByTint(shapes, new Set(['B']))).toEqual({ land: 'M0,0ZM2,2Z', word: 'M1,1Z' });
	});

	it('is all land without tinted countries', () => {
		expect(splitByTint(shapes, null)).toEqual({ land: 'M0,0ZM1,1ZM2,2Z', word: '' });
	});
});
