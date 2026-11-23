import { geoEqualEarth, geoMercator, type GeoProjection } from 'd3-geo';

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
