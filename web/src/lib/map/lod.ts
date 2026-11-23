import type { GeoProjection } from 'd3-geo';
import { feature } from 'topojson-client';
import { presimplify, simplify } from 'topojson-simplify';
import type { Feature, FeatureCollection, Geometry, MultiLineString } from 'geojson';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { BorderArcs } from './borders.js';

/**
 * Level-of-detail rendering for the country outlines.
 *
 * Drawing all ~98k points of the 1:50m map at every zoom level makes browsers (notably Firefox,
 * which rasterises SVG asynchronously and shows a stretched, blurry image until it finishes)
 * slow to redraw after zooming. Instead we draw only detail that is visible at the current zoom
 * (Visvalingam simplification, topology-preserving so shared borders stay identical) and, when
 * zoomed in, clip outlines to the area around the viewport.
 */

export type CountryTopology = Topology<{
	countries: GeometryCollection<{ name: string }>;
	/** Land outlines of disputed areas (MultiLineStrings), drawn dashed. */
	disputed?: GeometryCollection<{ name: string }>;
}>;
export type Country = Feature<Geometry, { name: string }> & { id: string };

/** What the map draws at one level of detail. */
export interface Layers {
	countries: Country[];
	solid: Feature<MultiLineString> | null;
	dashed: Feature<MultiLineString> | null;
}

export interface View {
	k: number;
	x: number;
	y: number;
}

/** Triangles smaller than this many square pixels are removed. */
export const MIN_AREA_PX = 0.5;
/** Clip outlines to the viewport (plus margin) from this zoom level on. */
export const CLIP_FROM_ZOOM = 4;
/** Margin around the viewport kept when clipping, in viewport sizes per side. */
export const CLIP_MARGIN = 1;

export function prepare(topology: CountryTopology): CountryTopology {
	return presimplify(topology) as CountryTopology;
}

/** Zoom levels are bucketed to powers of two so geometry is rebuilt only every 2x zoom. */
export function zoomBucket(k: number): number {
	return 2 ** Math.floor(Math.log2(Math.max(1, k)));
}

/**
 * Geometry detail used for a view: one bucket finer than strictly needed, so zooming in
 * during a gesture (before the geometry is rebuilt) still looks sharp.
 */
export function detailZoom(k: number): number {
	return zoomBucket(k) * 2;
}

/** Minimum triangle area (square degrees, as used by presimplify) for a zoom level. */
export function minWeight(projectionScale: number, k: number): number {
	const degPerPx = 180 / Math.PI / (projectionScale * k);
	return MIN_AREA_PX * degPerPx * degPerPx;
}

function lines(topo: CountryTopology, arcs: number[]): Feature<MultiLineString> | null {
	if (!arcs.length) return null;
	return feature(topo, {
		type: 'MultiLineString',
		arcs: arcs.map((a) => [a])
	}) as Feature<MultiLineString>;
}

export function simplifiedLayers(
	pre: CountryTopology,
	projectionScale: number,
	k: number,
	borders: BorderArcs
): Layers {
	const topo = simplify(pre, minWeight(projectionScale, detailZoom(k))) as CountryTopology;
	return {
		countries: (
			feature(topo, topo.objects.countries) as FeatureCollection<Geometry, { name: string }>
		).features as Country[],
		solid: lines(topo, borders.solid),
		dashed: lines(topo, borders.dashed)
	};
}

/** Projected (un-zoomed) rectangle to keep when rendering `view`, or null for no clipping. */
export function renderExtent(
	view: View,
	width: number,
	height: number
): [[number, number], [number, number]] | null {
	if (view.k < CLIP_FROM_ZOOM) return null;
	const x0 = -view.x / view.k;
	const y0 = -view.y / view.k;
	const w = width / view.k;
	const h = height / view.k;
	return [
		[x0 - CLIP_MARGIN * w, y0 - CLIP_MARGIN * h],
		[x0 + (1 + CLIP_MARGIN) * w, y0 + (1 + CLIP_MARGIN) * h]
	];
}

/** Does geometry rendered for `extent` still cover everything visible in `view`? */
export function covers(
	extent: [[number, number], [number, number]] | null,
	view: View,
	width: number,
	height: number
): boolean {
	if (!extent) return true;
	const x0 = -view.x / view.k;
	const y0 = -view.y / view.k;
	return (
		x0 >= extent[0][0] &&
		y0 >= extent[0][1] &&
		x0 + width / view.k <= extent[1][0] &&
		y0 + height / view.k <= extent[1][1]
	);
}

/** A copy of `base` (made by `create`, the same projection kind), optionally clipped to a projected rectangle. */
export function clippedProjection(
	create: () => GeoProjection,
	base: GeoProjection,
	extent: [[number, number], [number, number]] | null
): GeoProjection {
	const p = create().scale(base.scale()).translate(base.translate());
	return extent ? p.clipExtent(extent) : p;
}
