import { describe, expect, it } from 'vitest';
import { geoPath } from 'd3-geo';
import {
	DEFAULT_PROJECTION,
	MAX_WORLD_WIDTH,
	PROJECTIONS,
	maxZoom,
	parseProjection
} from './projections.js';

describe('projections', () => {
	it('defaults to Mercator', () => {
		expect(DEFAULT_PROJECTION).toBe('mercator');
		expect(Object.keys(PROJECTIONS)).toEqual(['mercator', 'equal-earth']); // toggle order
	});

	it('parses known names and falls back to the default for anything else', () => {
		expect(parseProjection('equal-earth')).toBe('equal-earth');
		expect(parseProjection('mercator')).toBe('mercator');
		for (const bad of [null, undefined, '', 'robinson', 'toString', '__proto__']) {
			expect(parseProjection(bad)).toBe('mercator');
		}
	});

	it('creates independent projections', () => {
		const a = PROJECTIONS.mercator.create().scale(10);
		expect(PROJECTIONS.mercator.create().scale()).not.toBe(a.scale());
	});

	it('lets every screen zoom in until the world is equally wide', () => {
		for (const { create } of Object.values(PROJECTIONS)) {
			const phone = maxZoom(create().fitWidth(370, { type: 'Sphere' }));
			const desktop = maxZoom(create().fitWidth(1240, { type: 'Sphere' }));
			expect(phone * 370).toBeCloseTo(MAX_WORLD_WIDTH, -2);
			expect(desktop * 1240).toBeCloseTo(MAX_WORLD_WIDTH, -2);
			const p = create();
			const [[x0], [x1]] = geoPath(p).bounds({ type: 'Sphere' });
			expect(maxZoom(p) * (x1 - x0)).toBeCloseTo(MAX_WORLD_WIDTH);
		}
	});
});
