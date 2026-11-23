import type { GeometryObject, Topology } from 'topojson-specification';
import type { GeoJsonProperties } from 'geojson';

/**
 * Which arcs of the map topology to stroke solid and which dashed.
 *
 * The pipeline (pipeline/geolang/borders.py) adds a `disputed` object: per disputed area, the arcs
 * of its land outline. Those are drawn dashed; every other country arc (borders and coastlines)
 * solid, each once. Arc indices survive topojson-simplify, so this is computed once per topology.
 */
export interface BorderArcs {
	solid: number[];
	dashed: number[];
}

function collect(arcs: unknown, into: Set<number>): void {
	if (typeof arcs === 'number') into.add(arcs < 0 ? ~arcs : arcs);
	else if (Array.isArray(arcs)) for (const a of arcs) collect(a, into);
}

function arcsOf(object: GeometryObject<GeoJsonProperties> | undefined): Set<number> {
	const ids = new Set<number>();
	if (!object) return ids;
	if (object.type === 'GeometryCollection') {
		for (const g of object.geometries) for (const id of arcsOf(g)) ids.add(id);
	} else if ('arcs' in object) {
		collect(object.arcs, ids);
	}
	return ids;
}

export function borderArcs(topology: Topology): BorderArcs {
	const dashed = arcsOf(topology.objects.disputed);
	const solid = [...arcsOf(topology.objects.countries)].filter((a) => !dashed.has(a));
	return {
		solid: solid.sort((a, b) => a - b),
		dashed: [...dashed].sort((a, b) => a - b)
	};
}
