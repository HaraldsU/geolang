<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { geoPath, type GeoProjection } from 'd3-geo';
	import { feature } from 'topojson-client';
	import { select } from 'd3-selection';
	import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
	import 'd3-transition';
	import type { Feature, FeatureCollection, Geometry } from 'geojson';
	import type { Topology, GeometryCollection } from 'topojson-specification';
	import {
		clippedProjection,
		covers,
		prepare,
		renderExtent,
		simplifiedLayers,
		zoomBucket,
		type CountryTopology,
		type Layers,
		type View
	} from './lod.js';
	import { borderArcs, type BorderArcs } from './borders.js';
	import { DEFAULT_PROJECTION, PROJECTIONS, type ProjectionName } from './projections.js';

	export type CountryFeature = Feature<Geometry, { name: string }> & { id: string };

	export interface MapContext {
		projection: GeoProjection;
		path: ReturnType<typeof geoPath>;
		features: CountryFeature[];
		k: number;
		x: number;
		y: number;
		width: number;
		height: number;
	}

	interface Props {
		topologyUrl?: string;
		selected?: string | null;
		maxZoom?: number;
		/** countries painted with the "has a word" tint */
		highlighted?: ReadonlySet<string> | null;
		/** map projection; switching it resets the view */
		projectionName?: ProjectionName;
		overlay?: Snippet<[MapContext]>;
		onselect?: (iso: string | null) => void;
		/** pointer (mouse) hover; never fired for touch */
		onhover?: (iso: string | null, event?: PointerEvent) => void;
	}

	let {
		topologyUrl = '/world/countries-50m.json',
		selected = $bindable(null),
		maxZoom = 40,
		highlighted = null,
		projectionName = DEFAULT_PROJECTION,
		overlay,
		onselect,
		onhover
	}: Props = $props();

	let container: HTMLDivElement;
	let svg: SVGSVGElement;
	let canvas: HTMLCanvasElement;
	let dpr = $state(1);
	let hovered = $state<string | null>(null);
	/** Data loaded, map sized and the initial view applied. */
	let ready = $state(false);
	let colors = $state({
		ocean: '',
		land: '',
		word: '',
		hover: '',
		selected: '',
		stroke: '',
		disputed: ''
	});
	let width = $state(0);
	let height = $state(0);
	let features = $state.raw<CountryFeature[]>([]);
	let transform = $state<{ k: number; x: number; y: number }>({ k: 1, x: 0, y: 0 });
	let loadError = $state<string | null>(null);
	let zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> | null = null;
	let userMoved = false;
	let pendingTransform: ZoomTransform | null = null;
	let frame: number | null = null;
	let simplifiable = $state.raw<CountryTopology | null>(null);
	let borders = $state.raw<BorderArcs>({ solid: [], dashed: [] });
	/** View the country geometry was last built for (updated when a gesture settles). */
	let renderView = $state.raw<View | null>(null);
	let renderTimer: ReturnType<typeof setTimeout> | undefined;
	const SETTLE_MS = 150;
	const settleMs = () =>
		(globalThis as { __geolangSettleMs?: number }).__geolangSettleMs ?? SETTLE_MS;

	const createProjection = $derived(PROJECTIONS[projectionName].create);
	const projection = $derived.by(() => {
		const p = createProjection();
		if (!features.length || !width || !height) return p;
		// Fit to everything except Antarctica so the inhabited world fills the screen.
		const fitTo: FeatureCollection = {
			type: 'FeatureCollection',
			features: features.filter((f) => f.id !== 'AQ')
		};
		const pad = Math.min(width, height) * 0.03;
		return p.fitExtent(
			[
				[pad, pad],
				[width - pad, height - pad]
			],
			fitTo
		);
	});

	const path = $derived(geoPath(projection));

	// Level of detail: simplified per 2x zoom bucket and, when zoomed in, clipped to the
	// area around the viewport (see lod.ts). Full-detail `features` are still used for fitting,
	// label anchors and anything else that needs exact geometry.
	let lodCache: { key: string; layers: Layers } | null = null;
	const lod = $derived.by((): Layers => {
		if (!simplifiable) return { countries: features, solid: null, dashed: null };
		const key = `${projection.scale()}|${zoomBucket(renderView?.k ?? 1)}`;
		if (lodCache?.key !== key) {
			lodCache = {
				key,
				layers: simplifiedLayers(simplifiable, projection.scale(), renderView?.k ?? 1, borders)
			};
		}
		return lodCache.layers;
	});
	const extent = $derived(renderView ? renderExtent(renderView, width, height) : null);
	const toPath = $derived(geoPath(clippedProjection(createProjection, projection, extent)));
	const shapes = $derived(
		lod.countries.map((f) => ({ id: f.id, name: f.properties.name, d: toPath(f) ?? '' }))
	);
	/** Borders and coastlines (solid) and disputed-area outlines (dashed); null before data loads. */
	const lines = $derived({
		solid: lod.solid && new Path2D(toPath(lod.solid) ?? ''),
		dashed: lod.dashed && new Path2D(toPath(lod.dashed) ?? '')
	});

	// Countries are painted on a canvas, redrawn synchronously on every frame at the exact zoom.
	// (An SVG is rasterised by the browser, and Firefox does that asynchronously: after a fast
	// zoom it shows a stretched, blurry bitmap until it catches up.) The SVG paths remain in the
	// DOM, invisible, for hit testing, hover/selection and accessibility.
	const paths = $derived.by(() => {
		const d = new Map(shapes.map((s) => [s.id, s.d]));
		const one = new Map<string, Path2D>();
		return {
			all: new Path2D(shapes.map((s) => s.d).join('')),
			get(id: string | null): Path2D | null {
				if (!id || !d.get(id)) return null;
				let p = one.get(id);
				if (!p) one.set(id, (p = new Path2D(d.get(id))));
				return p;
			}
		};
	});

	const highlightPath = $derived.by(() => {
		if (!highlighted?.size) return null;
		const d = shapes.filter((s) => highlighted.has(s.id) && s.d).map((s) => s.d);
		return d.length ? new Path2D(d.join('')) : null;
	});

	function paint() {
		const c = canvas?.getContext('2d');
		if (!c || !width || !height) return;
		const { k, x, y } = transform;
		c.setTransform(1, 0, 0, 1, 0, 0);
		c.fillStyle = colors.ocean;
		c.fillRect(0, 0, canvas.width, canvas.height);
		c.setTransform(dpr * k, 0, 0, dpr * k, dpr * x, dpr * y);
		c.fillStyle = colors.land;
		c.fill(paths.all);
		if (highlightPath) {
			c.fillStyle = colors.word;
			c.fill(highlightPath);
		}
		for (const [id, color] of [
			[hovered, colors.hover],
			[selected, colors.selected]
		] as const) {
			const p = paths.get(id);
			if (p) {
				c.fillStyle = color;
				c.fill(p);
			}
		}
		c.lineWidth = 0.6 / k;
		c.lineJoin = 'round';
		c.strokeStyle = colors.stroke;
		c.stroke(lines.solid ?? paths.all);
		if (lines.dashed) {
			c.strokeStyle = colors.disputed;
			c.setLineDash([3 / k, 2 / k]);
			c.stroke(lines.dashed);
			c.setLineDash([]);
		}
		canvas.dataset.disputed = String(lod.dashed?.geometry.coordinates.length ?? 0);
		canvas.dataset.k = k.toFixed(3); // zoom the last frame was painted at (for tests)
	}

	$effect(paint);

	function readColors() {
		const s = getComputedStyle(container);
		const v = (name: string) => s.getPropertyValue(name).trim();
		colors = {
			ocean: v('--ocean'),
			land: v('--land'),
			word: v('--land-word'),
			hover: v('--land-hover'),
			selected: v('--land-selected'),
			stroke: v('--land-stroke'),
			disputed: v('--border-disputed')
		};
	}

	function hover(iso: string | null, e: PointerEvent) {
		if (e.pointerType !== 'mouse') return;
		hovered = iso;
		onhover?.(iso, e);
	}

	/** Rebuild geometry for the current view: now if it no longer covers the screen, else on settle. */
	function scheduleRender(view: View) {
		clearTimeout(renderTimer);
		const stale =
			!renderView || !covers(extent, view, width, height) || (renderView.k >= 4 && view.k < 4); // leaving the clipped range: show the whole world
		const apply = () => {
			const changed =
				!renderView ||
				zoomBucket(renderView.k) !== zoomBucket(view.k) ||
				renderExtent(view, width, height) !== null ||
				renderExtent(renderView, width, height) !== null;
			if (changed) renderView = view;
		};
		if (stale) apply();
		else renderTimer = setTimeout(apply, settleMs());
	}

	const ctx = $derived<MapContext>({
		projection,
		path,
		features,
		k: transform.k,
		x: transform.x,
		y: transform.y,
		width,
		height
	});

	function applyExtent() {
		if (!zoomBehavior || !width || !height) return;
		zoomBehavior.translateExtent([
			[-width * 0.25, -height * 0.25],
			[width * 1.25, height * 1.25]
		]);
	}

	export function zoomBy(factor: number) {
		if (!zoomBehavior) return;
		userMoved = true;
		select(svg).transition().duration(250).call(zoomBehavior.scaleBy, factor);
	}

	/**
	 * Default view. On tall (portrait) screens the whole world would be a thin strip, so zoom in
	 * until the inhabited world fills most of the height, centred on Europe/Africa.
	 */
	function initialTransform(): ZoomTransform {
		if (!features.length || !width || !height) return zoomIdentity;
		const fc: FeatureCollection = {
			type: 'FeatureCollection',
			features: features.filter((f) => f.id !== 'AQ')
		};
		const [[, y0], [, y1]] = path.bounds(fc);
		const mapH = y1 - y0;
		if (height < mapH * 1.3) return zoomIdentity;
		const k = Math.min(4, (height * 0.75) / mapH);
		if (k <= 1) return zoomIdentity; // never start below the minimum zoom
		const [px, py] = projection([15, 25]) ?? [width / 2, height / 2];
		return zoomIdentity
			.translate(width / 2, height / 2)
			.scale(k)
			.translate(-px, -py);
	}

	export function resetZoom() {
		if (!zoomBehavior) return;
		userMoved = false;
		select(svg).transition().duration(300).call(zoomBehavior.transform, initialTransform());
	}

	// A view (zoom/pan) of one projection means nothing in another: start from the default view.
	$effect.pre(() => {
		void projectionName;
		userMoved = false;
	});

	$effect(() => {
		// Re-apply the default view when data arrives, the viewport or projection changes, unless
		// the user has already moved the map.
		const t = initialTransform();
		if (zoomBehavior && !userMoved) select(svg).call(zoomBehavior.transform, t);
	});

	export function getZoom() {
		return transform.k;
	}

	onMount(() => {
		const ro = new ResizeObserver((entries) => {
			const r = entries[0].contentRect;
			width = Math.round(r.width);
			height = Math.round(r.height);
			dpr = window.devicePixelRatio || 1;
			applyExtent();
		});
		ro.observe(container);
		readColors();
		const scheme = matchMedia('(prefers-color-scheme: dark)');
		scheme.addEventListener('change', readColors);

		zoomBehavior = d3zoom<SVGSVGElement, unknown>()
			.scaleExtent([1, maxZoom])
			.on('zoom', (event: { transform: ZoomTransform; sourceEvent: Event | null }) => {
				if (event.sourceEvent) userMoved = true;
				// Trackpads/fast wheels fire several events per frame. Updating the DOM for each
				// one makes d3's next getScreenCTM() force a full layout, so coalesce to one
				// update per animation frame.
				pendingTransform = event.transform;
				frame ??= requestAnimationFrame(() => {
					frame = null;
					const t = pendingTransform!;
					transform = { k: t.k, x: t.x, y: t.y };
					if (features.length && width && height) ready = true;
					scheduleRender(transform);
				});
			});
		select(svg).call(zoomBehavior);
		applyExtent();

		const controller = new AbortController();
		fetch(topologyUrl, { signal: controller.signal })
			.then((r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return r.json();
			})
			.then((topo: Topology<{ countries: GeometryCollection<{ name: string }> }>) => {
				const fc = feature(topo, topo.objects.countries) as unknown as FeatureCollection<
					Geometry,
					{ name: string }
				>;
				features = fc.features as CountryFeature[];
				borders = borderArcs(topo);
				simplifiable = prepare(topo as CountryTopology);
			})
			.catch((e: Error) => {
				if (e.name !== 'AbortError') loadError = e.message;
			});

		return () => {
			if (frame !== null) cancelAnimationFrame(frame);
			clearTimeout(renderTimer);
			controller.abort();
			ro.disconnect();
			scheme.removeEventListener('change', readColors);
			select(svg).on('.zoom', null);
		};
	});

	function choose(iso: string) {
		selected = selected === iso ? null : iso;
		onselect?.(selected);
	}
</script>

<div class="map" bind:this={container} data-testid="map-container">
	<canvas
		bind:this={canvas}
		width={Math.round(width * dpr)}
		height={Math.round(height * dpr)}
		data-testid="map-canvas"
		aria-hidden="true"
	></canvas>
	<svg
		bind:this={svg}
		{width}
		{height}
		viewBox={`0 0 ${width || 1} ${height || 1}`}
		role="img"
		aria-label="World map"
		data-testid="world-map"
		data-zoom={transform.k.toFixed(3)}
		data-ready={ready ? 'true' : 'false'}
		data-projection={projectionName}
		data-lod={zoomBucket(renderView?.k ?? 1)}
		data-clipped={extent ? 'true' : 'false'}
	>
		<rect
			class="ocean"
			x="0"
			y="0"
			{width}
			{height}
			role="presentation"
			onclick={() => {
				if (selected !== null) {
					selected = null;
					onselect?.(null);
				}
			}}
		/>
		<g
			data-testid="zoom-layer"
			transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}
		>
			<g class="countries">
				{#each shapes as s (s.id)}
					<path
						class="country"
						class:selected={selected === s.id}
						d={s.d}
						data-iso={s.id}
						onclick={() => choose(s.id)}
						onpointerenter={(e) => hover(s.id, e)}
						onpointermove={(e) => hover(s.id, e)}
						onpointerleave={(e) => hover(null, e)}
						role="presentation"
					></path>
				{/each}
			</g>
		</g>
	</svg>
	<!--
		Overlays (labels) live outside the map <svg>: anything inside the zoomed group is re-laid
		out by the browser on every zoom frame, and SVG text layout is expensive. The overlay is
		drawn in screen coordinates and follows gestures with a compositor-only CSS transform.
	-->
	{#if overlay && features.length}
		{@render overlay(ctx)}
	{/if}
	{#if loadError}
		<p class="error" role="alert">Could not load the map ({loadError}).</p>
	{/if}
</div>

<style>
	.map {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
	}
	canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	/* Invisible hit-testing layer on top of the canvas (opacity 0 is never painted, but still
	   receives pointer events). */
	svg {
		position: relative;
		display: block;
		width: 100%;
		height: 100%;
		cursor: grab;
		opacity: 0;
	}
	svg:active {
		cursor: grabbing;
	}
	.ocean,
	.country {
		fill: #000;
	}
	.country {
		cursor: pointer;
	}
	.error {
		position: absolute;
		inset: auto 16px 16px 16px;
		margin: 0;
		padding: 12px;
		background: var(--surface);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
	}
</style>
