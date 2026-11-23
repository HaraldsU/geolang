import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Topology } from 'topojson-specification';
import { borderArcs } from './borders.js';

// Two countries: A's coast (arc 0), the A|B border (arc 1, disputed), B's coast (arc 2), and a
// line inside A outlining a disputed area (arc 3, used by no country).
const tiny = (disputed: boolean): Topology =>
	({
		type: 'Topology',
		arcs: [[], [], [], []],
		objects: {
			countries: {
				type: 'GeometryCollection',
				geometries: [
					{ type: 'Polygon', id: 'A', arcs: [[0, 1]] },
					{ type: 'MultiPolygon', id: 'B', arcs: [[[~1, 2]]] }
				]
			},
			...(disputed && {
				disputed: {
					type: 'GeometryCollection',
					geometries: [{ type: 'MultiLineString', arcs: [[1], [3]], properties: { name: 'X' } }]
				}
			})
		}
	}) as unknown as Topology;

describe('borderArcs', () => {
	it('dashes the disputed arcs and strokes every other country arc solid, once', () => {
		expect(borderArcs(tiny(true))).toEqual({ solid: [0, 2], dashed: [1, 3] });
	});

	it('draws everything solid without disputed areas', () => {
		expect(borderArcs(tiny(false))).toEqual({ solid: [0, 1, 2], dashed: [] });
	});

	it('finds dashed lines in the real map, separate from the solid ones', () => {
		const topo: Topology = JSON.parse(
			readFileSync(
				fileURLToPath(new URL('../../../static/world/countries-50m.json', import.meta.url)),
				'utf-8'
			)
		);
		const { solid, dashed } = borderArcs(topo);
		expect(dashed.length).toBeGreaterThan(20);
		expect(solid.length).toBeGreaterThan(1000);
		expect(solid.filter((a) => dashed.includes(a))).toEqual([]);
	});
});
