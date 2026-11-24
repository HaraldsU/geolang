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

/** Squared distance from a point to a segment (hot loop: no allocations, no Math.hypot). */
function segmentDistanceSq(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
	let x = ax;
	let y = ay;
	const dx = bx - ax;
	const dy = by - ay;
	if (dx !== 0 || dy !== 0) {
		const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
		if (t > 1) {
			x = bx;
			y = by;
		} else if (t > 0) {
			x += dx * t;
			y += dy * t;
		}
	}
	return (px - x) * (px - x) + (py - y) * (py - y);
}

/** Distance from a point to the ring's border: positive inside, negative outside. */
export function borderDistance(px: number, py: number, ring: Ring): number {
	let inside = false;
	let min = Infinity;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const ax = ring[i][0];
		const ay = ring[i][1];
		const bx = ring[j][0];
		const by = ring[j][1];
		if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) inside = !inside;
		const d = segmentDistanceSq(px, py, ax, ay, bx, by);
		if (d < min) min = d;
	}
	return (inside ? 1 : -1) * Math.sqrt(min);
}

/** Area centroid of a ring (falls back to the vertex average for degenerate rings). */
function ringCentroid(ring: Ring): [number, number] {
	let a = 0;
	let cx = 0;
	let cy = 0;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
		a += f;
		cx += (ring[j][0] + ring[i][0]) * f;
		cy += (ring[j][1] + ring[i][1]) * f;
	}
	if (Math.abs(a) < 1e-12) {
		const n = ring.length;
		return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
	}
	return [cx / (3 * a), cy / (3 * a)];
}

/** Minimal binary min-heap keyed by `key`. */
class MinHeap<T> {
	private items: T[] = [];
	constructor(private key: (item: T) => number) {}
	get size() {
		return this.items.length;
	}
	push(item: T) {
		const a = this.items;
		a.push(item);
		let i = a.length - 1;
		while (i > 0) {
			const parent = (i - 1) >> 1;
			if (this.key(a[parent]) <= this.key(a[i])) break;
			[a[parent], a[i]] = [a[i], a[parent]];
			i = parent;
		}
	}
	pop(): T | undefined {
		const a = this.items;
		const top = a[0];
		const last = a.pop();
		if (a.length && last !== undefined) {
			a[0] = last;
			let i = 0;
			for (;;) {
				const l = 2 * i + 1;
				const r = l + 1;
				let m = i;
				if (l < a.length && this.key(a[l]) < this.key(a[m])) m = l;
				if (r < a.length && this.key(a[r]) < this.key(a[m])) m = r;
				if (m === i) break;
				[a[m], a[i]] = [a[i], a[m]];
				i = m;
			}
		}
		return top;
	}
}

/** Drop consecutive points closer than `tolerance` (they don't change distances noticeably). */
function thin(ring: Ring, tolerance: number): Ring {
	const out: Ring = [ring[0]];
	for (let i = 1; i < ring.length; i++) {
		const [x, y] = out[out.length - 1];
		const dx = ring[i][0] - x;
		const dy = ring[i][1] - y;
		if (dx * dx + dy * dy >= tolerance * tolerance) out.push(ring[i]);
	}
	return out.length >= 3 ? out : ring;
}

/**
 * Label positions must leave at least this fraction of the largest possible room (distance to
 * the border); among those positions the one closest to the country's centre is used.
 */
export const PLACEMENT_MIN_FRACTION = 0.8;

/**
 * Label position for a ring: the point closest to the area centroid among all points at least
 * `minFraction` as far from the border as the pole of inaccessibility (polylabel).
 *
 * The plain pole is decided by tiny width differences in long, even shapes (Latvia's sat at its
 * eastern end); this keeps labels in a clearly wider region (Norway's south-west) but centres
 * them when the room is about the same everywhere. Branch-and-bound over square cells, like
 * polylabel, so large countries stay fast.
 */
export function centralPole(
	ring: Ring,
	minFraction = PLACEMENT_MIN_FRACTION,
	precision = 0.5
): { x: number; y: number; distance: number } {
	// Many projected outlines have thousands of sub-pixel points; every distance check walks
	// them all, so thin them first (moves distances by at most a quarter of `precision`).
	ring = thin(ring, precision / 4);
	const pole = polylabel([ring], precision) as number[] & { distance: number };
	const threshold = pole.distance * minFraction;
	const [cx, cy] = ringCentroid(ring);
	const toCentre = (x: number, y: number) => Math.hypot(x - cx, y - cy);

	let best = { x: pole[0], y: pole[1], distance: pole.distance };
	let bestToCentre = toCentre(best.x, best.y);

	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const [x, y] of ring) {
		minX = Math.min(minX, x);
		minY = Math.min(minY, y);
		maxX = Math.max(maxX, x);
		maxY = Math.max(maxY, y);
	}
	const size = Math.min(maxX - minX, maxY - minY);
	if (!(size > 0) || !(pole.distance > 0)) return best;

	interface Cell {
		x: number;
		y: number;
		/** half the cell size */
		h: number;
		d: number;
		/** lower bound of the distance to the centroid for any point in the cell */
		lb: number;
	}
	const cell = (x: number, y: number, h: number): Cell => ({
		x,
		y,
		h,
		d: borderDistance(x, y, ring),
		lb: Math.max(0, toCentre(x, y) - h * Math.SQRT2)
	});
	const queue = new MinHeap<Cell>((c) => c.lb);
	const h0 = size / 2;
	for (let x = minX; x < maxX; x += size) {
		for (let y = minY; y < maxY; y += size) queue.push(cell(x + h0, y + h0, h0));
	}

	while (queue.size) {
		const c = queue.pop()!;
		// nothing left can get closer to the centre by more than `precision`
		if (c.lb >= bestToCentre - precision) break;
		if (c.d >= threshold) {
			const dc = toCentre(c.x, c.y);
			if (dc < bestToCentre) {
				best = { x: c.x, y: c.y, distance: c.d };
				bestToCentre = dc;
			}
		}
		// no point in this cell can have enough room, or cells are already fine enough
		if (c.d + c.h * Math.SQRT2 < threshold || c.h * 2 <= precision) continue;
		const h = c.h / 2;
		queue.push(cell(c.x - h, c.y - h, h));
		queue.push(cell(c.x + h, c.y - h, h));
		queue.push(cell(c.x - h, c.y + h, h));
		queue.push(cell(c.x + h, c.y + h, h));
	}
	return best;
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
	// Tiny countries are a pixel or less across at the base zoom: search them at a precision
	// relative to their size, or their label room would round down to nothing.
	let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
	for (const [x, y] of best) {
		x0 = Math.min(x0, x);
		y0 = Math.min(y0, y);
		x1 = Math.max(x1, x);
		y1 = Math.max(y1, y);
	}
	const p = centralPole(
		best,
		PLACEMENT_MIN_FRACTION,
		Math.max(1e-6, Math.min(0.5, Math.min(x1 - x0, y1 - y0) / 50))
	);
	return { iso, x: p.x, y: p.y, r: p.distance, area: total };
}

/** Label font size in screen px: grows gently as you zoom in. */
export function fontSize(k: number): number {
	return Math.max(11, Math.min(17, 11 + Math.log2(Math.max(1, k)) * 1.5));
}

/** How much a label may overflow its country's inscribed circle before it is hidden. */
export const FIT_FACTOR = 2.2;

export interface Box {
	x0: number;
	y0: number;
	x1: number;
	y1: number;
}

/** Largest countries first (ties broken by ISO code so placement is deterministic). */
function byImportance(items: LabelItem[]): LabelItem[] {
	return [...items].sort((a, b) => b.anchor.area - a.anchor.area || (a.iso < b.iso ? -1 : 1));
}

function screenPoint(anchor: Anchor, t: Transform): [number, number] {
	return [anchor.x * t.k + t.x, anchor.y * t.k + t.y];
}

/**
 * Decide which labels to show at a zoom level: a label must roughly fit inside its country,
 * be on screen, and not collide with a more important (larger) country's label.
 * Also returns the screen boxes of the placed labels.
 */
export function placeLabelBoxes(
	items: LabelItem[],
	t: Transform,
	viewport: { width: number; height: number }
): { visible: Set<string>; boxes: Box[] } {
	const visible = new Set<string>();
	const boxes: Box[] = [];
	const pad = 2;
	for (const it of byImportance(items)) {
		const diameter = it.anchor.r * 2 * t.k;
		if (it.width > diameter * FIT_FACTOR || it.height > diameter * 1.5) continue;
		const [cx, cy] = screenPoint(it.anchor, t);
		const box = {
			x0: cx - it.width / 2 - pad,
			x1: cx + it.width / 2 + pad,
			y0: cy - it.height / 2 - pad,
			y1: cy + it.height / 2 + pad
		};
		// must be fully on screen, otherwise it would be cut off at the edge
		if (box.x0 < 0 || box.y0 < 0 || box.x1 > viewport.width || box.y1 > viewport.height) continue;
		if (boxes.some((b) => box.x0 < b.x1 && b.x0 < box.x1 && box.y0 < b.y1 && b.y0 < box.y1)) {
			continue;
		}
		boxes.push(box);
		visible.add(it.iso);
	}
	return { visible, boxes };
}

export function placeLabels(
	items: LabelItem[],
	t: Transform,
	viewport: { width: number; height: number }
): Set<string> {
	return placeLabelBoxes(items, t, viewport).visible;
}

/** Radius of the marker drawn for a country whose label is hidden, in screen px. */
export const DOT_RADIUS = 3.5;

/**
 * Countries whose label is hidden get a small dot instead, so it is clear they have a word.
 * Dots must be on screen, must not cover a shown label, and are thinned out in crowded areas
 * (larger countries win) so they stay at least `minGap` px apart.
 */
export function placeDots(
	items: LabelItem[],
	visible: ReadonlySet<string>,
	boxes: readonly Box[],
	t: Transform,
	viewport: { width: number; height: number },
	minGap = 7
): Set<string> {
	const dots = new Set<string>();
	const kept: [number, number][] = [];
	const r = DOT_RADIUS;
	for (const it of byImportance(items)) {
		if (visible.has(it.iso)) continue;
		const [x, y] = screenPoint(it.anchor, t);
		if (x - r < 0 || y - r < 0 || x + r > viewport.width || y + r > viewport.height) continue;
		if (boxes.some((b) => x + r > b.x0 && x - r < b.x1 && y + r > b.y0 && y - r < b.y1)) continue;
		if (kept.some(([kx, ky]) => (kx - x) ** 2 + (ky - y) ** 2 < minGap * minGap)) continue;
		kept.push([x, y]);
		dots.add(it.iso);
	}
	return dots;
}
