import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECTION, PROJECTIONS, parseProjection } from './projections.js';

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
});
