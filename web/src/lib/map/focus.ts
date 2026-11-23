/** Framing a selected country: which of its parts to show, and the zoom/pan that centres them. */

export type Bounds = [[number, number], [number, number]];
export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}
export interface Part {
	bounds: Bounds;
	area: number;
}

/** How much of the free view the country should fill when zooming to it. */
export const FILL = 0.5;
/** Keep the current zoom while the country is at least this share of FILL, and still fits. */
const KEEP_MIN = 1 / 3;
const KEEP_MAX = 1.6;

const gap = (a: Bounds, b: Bounds) =>
	Math.max(0, a[0][0] - b[1][0], b[0][0] - a[1][0], a[0][1] - b[1][1], b[0][1] - a[1][1]);

const union = (a: Bounds, b: Bounds): Bounds => [
	[Math.min(a[0][0], b[0][0]), Math.min(a[0][1], b[0][1])],
	[Math.max(a[1][0], b[1][0]), Math.max(a[1][1], b[1][1])]
];

/**
 * The bounds of a country's main body: its largest part plus every part close to it (within half
 * the body's size, growing as parts are added). Far-off territories, such as French Guiana for
 * France, are left out so that the main body is not shown tiny.
 */
export function mainBounds(parts: Part[]): Bounds | null {
	if (!parts.length) return null;
	const rest = [...parts];
	rest.sort((a, b) => b.area - a.area);
	let body = rest.shift()!.bounds;
	for (let added = true; added;) {
		added = false;
		const reach = 0.5 * Math.max(body[1][0] - body[0][0], body[1][1] - body[0][1]);
		for (let i = rest.length - 1; i >= 0; i--) {
			if (gap(body, rest[i].bounds) <= reach) {
				body = union(body, rest.splice(i, 1)[0].bounds);
				added = true;
			}
		}
	}
	return body;
}

/**
 * The largest part of the map not covered by `cover` (e.g. the country panel), in map
 * coordinates: beside it, above it or below it.
 */
export function freeArea(map: Rect, cover?: Rect | null): Rect {
	if (!cover) return map;
	const left = Math.max(map.x, cover.x);
	const right = Math.min(map.x + map.width, cover.x + cover.width);
	const top = Math.max(map.y, cover.y);
	const bottom = Math.min(map.y + map.height, cover.y + cover.height);
	if (left >= right || top >= bottom) return map;
	const candidates: Rect[] = [
		{ x: map.x, y: map.y, width: left - map.x, height: map.height },
		{ x: right, y: map.y, width: map.x + map.width - right, height: map.height },
		{ x: map.x, y: map.y, width: map.width, height: top - map.y },
		{ x: map.x, y: bottom, width: map.width, height: map.y + map.height - bottom }
	];
	return candidates.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a));
}

/**
 * Zoom and pan that centre `bounds` (in unzoomed map coordinates) in `free`. The zoom changes only
 * when needed: in when the country would be small, out when it would not fit.
 */
export function focusTransform(
	bounds: Bounds,
	free: Rect,
	k: number,
	[minK, maxK]: [number, number]
): { k: number; x: number; y: number } {
	const w = Math.max(bounds[1][0] - bounds[0][0], 1e-6);
	const h = Math.max(bounds[1][1] - bounds[0][1], 1e-6);
	const fit = Math.min((free.width * FILL) / w, (free.height * FILL) / h);
	const target = k >= fit * KEEP_MIN && k <= fit * KEEP_MAX ? k : fit;
	const nk = Math.min(maxK, Math.max(minK, target));
	const cx = (bounds[0][0] + bounds[1][0]) / 2;
	const cy = (bounds[0][1] + bounds[1][1]) / 2;
	return { k: nk, x: free.x + free.width / 2 - nk * cx, y: free.y + free.height / 2 - nk * cy };
}
