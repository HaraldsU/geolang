/**
 * Raster cache for panning.
 *
 * Redrawing every country outline is expensive at low zoom (the whole world is visible), yet a
 * pan only moves pixels that were already drawn. So the map's base layer is rendered once into
 * an offscreen bitmap a little larger than the viewport, and pan frames just copy it at an
 * offset. Positions are in device pixels of "zoomed space": a map point p (projected, unzoomed)
 * is at dpr * k * p there, and on screen at that plus the rounded device translation. Rounding
 * the translation to whole device pixels makes a copied frame identical to a fresh render.
 */

import type { View } from './lod.js';

/** Extra area cached around the viewport, per side, as a fraction of the viewport size. */
export const CACHE_MARGIN = 0.5;
/** Largest cache bitmap (device pixels): iOS Safari refuses canvases above 16,777,216. */
export const MAX_CACHE_PIXELS = 16_000_000;

/** A rectangle in device pixels of zoomed space (whole numbers). */
export interface DeviceRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** Device translation of a view: rounded, so cached and fresh frames line up exactly. */
export function deviceOffset(view: View, dpr: number): [number, number] {
	return [Math.round(view.x * dpr), Math.round(view.y * dpr)];
}

/**
 * Area to cache for `view`: the viewport plus a margin, shrunk so the bitmap stays within
 * MAX_CACHE_PIXELS (null if even the viewport is too large). It is centred on the viewport but
 * slid to stay within the pannable area `extent` (unzoomed map coordinates, as given to d3-zoom's
 * translateExtent): nothing outside can ever be shown, so near an edge the margin goes to the
 * other side. Fully zoomed out the whole pannable area fits, and a pan never redraws.
 */
export function cacheRegion(
	view: View,
	width: number,
	height: number,
	dpr: number,
	extent: [[number, number], [number, number]]
): DeviceRect | null {
	const [ox, oy] = deviceOffset(view, dpr);
	const vw = Math.ceil(width * dpr);
	const vh = Math.ceil(height * dpr);
	if (vw * vh > MAX_CACHE_PIXELS) return null;
	const grow = Math.min(1 + 2 * CACHE_MARGIN, Math.sqrt(MAX_CACHE_PIXELS / (vw * vh)));
	const s = dpr * view.k;
	// one axis: the viewport in zoomed space is [-o, -o + size]
	const span = (o: number, size: number, lo: number, hi: number): [number, number] => {
		const want = Math.floor(size * grow);
		let start = -o - Math.floor((want - size) / 2);
		start = Math.max(Math.min(start, Math.ceil(hi * s) - want), Math.floor(lo * s));
		const end = Math.min(start + want, Math.ceil(hi * s));
		// always the whole viewport, even if d3-zoom ever let it past the extent
		return [Math.min(start, -o), Math.max(end, -o + size)];
	};
	const [x0, x1] = span(ox, vw, extent[0][0], extent[1][0]);
	const [y0, y1] = span(oy, vh, extent[0][1], extent[1][1]);
	return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Does the cached `region` cover a `cw` x `ch` canvas at device translation (ox, oy)? */
export function regionCovers(
	region: DeviceRect,
	[ox, oy]: [number, number],
	cw: number,
	ch: number
): boolean {
	const bx = region.x + ox;
	const by = region.y + oy;
	return bx <= 0 && by <= 0 && bx + region.w >= cw && by + region.h >= ch;
}

/**
 * Is it worth rebuilding the cache while the map is still? Yes once the view has used up more
 * than half of the margin on some side: `fresh` (the region for the view now) has moved that far
 * from `cached`. The next drag then has margin to spare in every direction.
 */
export function worthRecentring(
	cached: DeviceRect,
	fresh: DeviceRect,
	viewportW: number,
	viewportH: number
): boolean {
	const halfMarginX = Math.max(0, fresh.w - viewportW) / 4;
	const halfMarginY = Math.max(0, fresh.h - viewportH) / 4;
	return (
		Math.abs(fresh.x - cached.x) > halfMarginX ||
		Math.abs(fresh.y - cached.y) > halfMarginY ||
		Math.abs(fresh.x + fresh.w - (cached.x + cached.w)) > halfMarginX ||
		Math.abs(fresh.y + fresh.h - (cached.y + cached.h)) > halfMarginY
	);
}

/** Path data of the countries drawn plain and of those tinted (they have the word): disjoint. */
export function splitByTint(
	shapes: readonly { id: string; d: string }[],
	tinted: ReadonlySet<string> | null
): { land: string; word: string } {
	let land = '';
	let word = '';
	for (const s of shapes) {
		if (tinted?.has(s.id)) word += s.d;
		else land += s.d;
	}
	return { land, word };
}
