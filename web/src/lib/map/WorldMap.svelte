<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { geoEqualEarth, geoPath, type GeoProjection } from 'd3-geo';
	import { feature } from 'topojson-client';
	import { select } from 'd3-selection';
	import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
	import 'd3-transition';
	import type { Feature, FeatureCollection, Geometry } from 'geojson';
	import type { Topology, GeometryCollection } from 'topojson-specification';

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
		overlay?: Snippet<[MapContext]>;
		onselect?: (iso: string | null) => void;
		/** pointer (mouse) hover; never fired for touch */
		onhover?: (iso: string | null, event?: PointerEvent) => void;
	}

	let {
		topologyUrl = '/world/countries-50m.json',
		selected = $bindable(null),
		maxZoom = 40,
		overlay,
		onselect,
		onhover
	}: Props = $props();

	let container: HTMLDivElement;
	let svg: SVGSVGElement;
	let width = $state(0);
	let height = $state(0);
	let features = $state.raw<CountryFeature[]>([]);
	let transform = $state<{ k: number; x: number; y: number }>({ k: 1, x: 0, y: 0 });
	let loadError = $state<string | null>(null);
	let zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> | null = null;
	let userMoved = false;

	const projection = $derived.by(() => {
		const p = geoEqualEarth();
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
	const shapes = $derived(
		features.map((f) => ({ id: f.id, name: f.properties.name, d: path(f) ?? '' }))
	);

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

	$effect(() => {
		// Re-apply the default view when data arrives or the viewport changes, unless the user
		// has already moved the map.
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
			applyExtent();
		});
		ro.observe(container);

		zoomBehavior = d3zoom<SVGSVGElement, unknown>()
			.scaleExtent([1, maxZoom])
			.on('zoom', (event: { transform: ZoomTransform; sourceEvent: Event | null }) => {
				if (event.sourceEvent) userMoved = true;
				const t = event.transform;
				transform = { k: t.k, x: t.x, y: t.y };
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
			})
			.catch((e: Error) => {
				if (e.name !== 'AbortError') loadError = e.message;
			});

		return () => {
			controller.abort();
			ro.disconnect();
			select(svg).on('.zoom', null);
		};
	});

	function choose(iso: string) {
		selected = selected === iso ? null : iso;
		onselect?.(selected);
	}
</script>

<div class="map" bind:this={container} data-testid="map-container">
	<svg
		bind:this={svg}
		{width}
		{height}
		viewBox={`0 0 ${width || 1} ${height || 1}`}
		role="img"
		aria-label="World map"
		data-testid="world-map"
		data-zoom={transform.k.toFixed(3)}
		data-ready={features.length > 0 ? 'true' : 'false'}
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
						onpointerenter={(e) => e.pointerType === 'mouse' && onhover?.(s.id, e)}
						onpointermove={(e) => e.pointerType === 'mouse' && onhover?.(s.id, e)}
						onpointerleave={(e) => e.pointerType === 'mouse' && onhover?.(null, e)}
						role="presentation"
					></path>
				{/each}
			</g>
			{#if overlay && features.length}
				{@render overlay(ctx)}
			{/if}
		</g>
	</svg>
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
	svg {
		display: block;
		width: 100%;
		height: 100%;
		cursor: grab;
	}
	svg:active {
		cursor: grabbing;
	}
	.ocean {
		fill: var(--ocean);
	}
	.country {
		fill: var(--land);
		stroke: var(--land-stroke);
		stroke-width: 0.6px;
		vector-effect: non-scaling-stroke;
		stroke-linejoin: round;
		transition: fill 120ms ease;
		cursor: pointer;
	}
	@media (hover: hover) {
		.country:hover {
			fill: var(--land-hover);
		}
	}
	.country.selected {
		fill: var(--land-selected);
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
