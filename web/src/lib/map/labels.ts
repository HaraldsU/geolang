import { geoPath, type GeoProjection } from 'd3-geo';
import polylabel from 'polylabel';
import type { Feature, Geometry } from 'geojson';

export interface Anchor {
	iso: string;
	/** projected (un-zoomed) coordinates of the label centre */
	x: number;
	y: number;
	/** radius of the largest circle that fits inside the country's main polygon */
	r: number;
	/** projected area of the whole country, used as label priority */
	area: number;
}

export interface Transform {
	k: number;
	x: number;
	y: number;
}

export interface LabelItem {
	iso: string;
	anchor: Anchor;
	/** label size in screen pixels */
	width: number;
	height: number;
}

type Ring = [number, number][];

function ringArea(ring: Ring): number {
	let a = 0;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
	}
	return Math.abs(a / 2);
}

/** Projected rings after d3's antimeridian clipping (so Russia/Fiji are handled correctly). */
export function projectedRings(feature: Feature<Geometry>, projection: GeoProjection): Ring[] {
	const rings: Ring[] = [];
	let current: Ring = [];
	const context = {
		beginPath() {},
		moveTo(x: number, y: number) {
			current = [[x, y]];
			rings.push(current);
		},
		lineTo(x: number, y: number) {
			current.push([x, y]);
		},
		closePath() {},
		arc() {}
	};
	geoPath(projection, context as unknown as CanvasRenderingContext2D)(feature);
	return rings.filter((r) => r.length >= 3);
}

export function computeAnchor(
	iso: string,
	feature: Feature<Geometry>,
	projection: GeoProjection
): Anchor | null {
	const rings = projectedRings(feature, projection);
	if (!rings.length) return null;
	let best = rings[0];
	let bestArea = ringArea(best);
	let total = 0;
	for (const ring of rings) {
		const a = ringArea(ring);
		total += a;
		if (a > bestArea) {
			best = ring;
			bestArea = a;
		}
	}
	const p = polylabel([best], 0.5) as number[] & { distance: number };
	return { iso, x: p[0], y: p[1], r: p.distance, area: total };
}

/** Label font size in screen px: grows gently as you zoom in. */
export function fontSize(k: number): number {
	return Math.max(11, Math.min(17, 11 + Math.log2(Math.max(1, k)) * 1.5));
}

/** How much a label may overflow its country's inscribed circle before it is hidden. */
export const FIT_FACTOR = 2.2;

/**
 * Decide which labels to show at a zoom level: a label must roughly fit inside its country,
 * be on screen, and not collide with a more important (larger) country's label.
 */
export function placeLabels(
	items: LabelItem[],
	t: Transform,
	viewport: { width: number; height: number }
): Set<string> {
	const visible = new Set<string>();
	const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
	const sorted = [...items].sort(
		(a, b) => b.anchor.area - a.anchor.area || (a.iso < b.iso ? -1 : 1)
	);
	const pad = 2;
	for (const it of sorted) {
		const diameter = it.anchor.r * 2 * t.k;
		if (it.width > diameter * FIT_FACTOR || it.height > diameter * 1.5) continue;
		const cx = it.anchor.x * t.k + t.x;
		const cy = it.anchor.y * t.k + t.y;
		const box = {
			x0: cx - it.width / 2 - pad,
			x1: cx + it.width / 2 + pad,
			y0: cy - it.height / 2 - pad,
			y1: cy + it.height / 2 + pad
		};
		// must be fully on screen, otherwise it would be cut off at the edge
		if (box.x0 < 0 || box.y0 < 0 || box.x1 > viewport.width || box.y1 > viewport.height) continue;
		if (placed.some((b) => box.x0 < b.x1 && b.x0 < box.x1 && box.y0 < b.y1 && b.y0 < box.y1)) {
			continue;
		}
		placed.push(box);
		visible.add(it.iso);
	}
	return visible;
}
