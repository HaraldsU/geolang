import { geoEqualEarth, geoMercator, geoPath, type GeoProjection } from 'd3-geo';

export type ProjectionName = 'mercator' | 'equal-earth';

export const DEFAULT_PROJECTION: ProjectionName = 'mercator';

export const PROJECTIONS: Record<ProjectionName, { label: string; create: () => GeoProjection }> = {
	mercator: { label: 'Mercator', create: geoMercator },
	'equal-earth': { label: 'Equal Earth', create: geoEqualEarth }
};

/** A projection name from untrusted input (e.g. the URL), else the default. */
export function parseProjection(value: string | null | undefined): ProjectionName {
	return value && Object.hasOwn(PROJECTIONS, value)
		? (value as ProjectionName)
		: DEFAULT_PROJECTION;
}

/**
 * How wide the whole world is, in screen px, at the deepest zoom: wide enough that even the
 * Vatican's word fits inside it. Fixed in px rather than as a zoom factor, so small screens
 * (where the world starts out small) can zoom in as far as large ones.
 */
export const MAX_WORLD_WIDTH = 2_000_000;

/** The deepest zoom factor for a projection fitted to the screen. */
export function maxZoom(projection: GeoProjection): number {
	const [[x0], [x1]] = geoPath(projection).bounds({ type: 'Sphere' });
	return Math.max(1, MAX_WORLD_WIDTH / (x1 - x0));
}
