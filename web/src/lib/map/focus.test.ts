import { describe, expect, it } from 'vitest';
import { FILL, focusTransform, freeArea, mainBounds, type Bounds } from './focus.js';

const part = (x0: number, y0: number, x1: number, y1: number) => ({
	bounds: [
		[x0, y0],
		[x1, y1]
	] as Bounds,
	area: (x1 - x0) * (y1 - y0)
});

describe('mainBounds', () => {
	it('frames the largest part with nearby islands, not far-off territories', () => {
		// mainland 100×100, an island 20 away, a territory 1000 away
		const parts = [part(1000, 0, 1050, 50), part(0, 0, 100, 100), part(120, 40, 130, 50)];
		expect(mainBounds(parts)).toEqual([
			[0, 0],
			[130, 100]
		]);
	});

	it('grows along a chain of islands', () => {
		const chain = [0, 1, 2, 3].map((i) => part(i * 30, 0, i * 30 + 20, 20));
		expect(mainBounds(chain)).toEqual([
			[0, 0],
			[110, 20]
		]);
	});

	it('returns null without parts', () => {
		expect(mainBounds([])).toBeNull();
	});
});

describe('freeArea', () => {
	const map = { x: 0, y: 0, width: 1000, height: 600 };

	it('is the whole map without a cover, or with one outside the map', () => {
		expect(freeArea(map, null)).toEqual(map);
		expect(freeArea(map, { x: 0, y: 700, width: 100, height: 100 })).toEqual(map);
	});

	it('is beside a side panel', () => {
		expect(freeArea(map, { x: 12, y: 10, width: 300, height: 400 })).toEqual({
			x: 312,
			y: 0,
			width: 688,
			height: 600
		});
	});

	it('is above a bottom sheet', () => {
		expect(freeArea(map, { x: 0, y: 400, width: 1000, height: 300 })).toEqual({
			x: 0,
			y: 0,
			width: 1000,
			height: 400
		});
	});
});

describe('focusTransform', () => {
	const free = { x: 0, y: 0, width: 1000, height: 600 };
	const small: Bounds = [
		[495, 295],
		[505, 305]
	];
	const centre = (t: { k: number; x: number; y: number }, b: Bounds) => [
		t.x + (t.k * (b[0][0] + b[1][0])) / 2,
		t.y + (t.k * (b[0][1] + b[1][1])) / 2
	];

	it('zooms in on a small country until it fills part of the view, centred', () => {
		const t = focusTransform(small, free, 1, [1, 100]);
		expect(t.k).toBeCloseTo((600 * FILL) / 10);
		expect(centre(t, small)).toEqual([500, 300]);
	});

	it('only pans when the country is already a good size', () => {
		const b: Bounds = [
			[0, 0],
			[200, 100]
		];
		const t = focusTransform(b, free, 1.5, [1, 40]);
		expect(t.k).toBe(1.5);
		expect(centre(t, b)).toEqual([500, 300]);
	});

	it('zooms out when the country does not fit', () => {
		const b: Bounds = [
			[0, 0],
			[400, 200]
		];
		expect(focusTransform(b, free, 10, [1, 40]).k).toBeCloseTo(1.25);
	});

	it('stays within the zoom limits', () => {
		expect(focusTransform(small, free, 1, [1, 8]).k).toBe(8);
		const huge: Bounds = [
			[0, 0],
			[5000, 5000]
		];
		expect(focusTransform(huge, free, 2, [1, 8]).k).toBe(1);
	});

	it('centres in the free area beside a panel', () => {
		const side = { x: 312, y: 0, width: 688, height: 600 };
		expect(centre(focusTransform(small, side, 1, [1, 100]), small)).toEqual([656, 300]);
	});
});
