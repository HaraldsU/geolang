<script lang="ts">
	import type { MapContext } from './WorldMap.svelte';
	import { computeAnchor, fontSize, placeLabels, type Anchor, type LabelItem } from './labels.js';
	import type { CountryLabel } from '#lib/data/country-labels.js';
	import { fontStack } from '#lib/fonts.js';

	interface Props {
		ctx: MapContext;
		labels: Map<string, CountryLabel>;
	}
	let { ctx, labels }: Props = $props();

	// Anchors are expensive (project every outline + polylabel) and depend only on the
	// projection (viewport size) and features, never on zoom/pan. `ctx` is a new object on
	// every zoom frame, so memoise by identity instead of relying on reactivity.
	let anchorCache: {
		features: MapContext['features'] | null;
		projection: MapContext['projection'] | null;
		value: Map<string, Anchor>;
	} = { features: null, projection: null, value: new Map() };

	const anchors = $derived.by(() => {
		const { features, projection } = ctx;
		if (anchorCache.features === features && anchorCache.projection === projection) {
			return anchorCache.value;
		}
		const out = new Map<string, Anchor>();
		for (const f of features) {
			const a = computeAnchor(f.id, f, projection);
			if (a) out.set(f.id, a);
		}
		anchorCache = { features, projection, value: out };
		return out;
	});

	let canvas: CanvasRenderingContext2D | null = null;
	const widthCache = new Map<string, number>();

	/** Text width at 100px, measured with the real font (estimated if canvas is unavailable). */
	function width100(text: string, font: string): number {
		const key = `${font}\u0000${text}`;
		let w = widthCache.get(key);
		if (w === undefined) {
			canvas ??= document.createElement('canvas').getContext('2d');
			if (canvas) {
				canvas.font = `600 100px ${fontStack(font)}`;
				w = canvas.measureText(text).width;
			} else {
				w = [...text].length * 60;
			}
			widthCache.set(key, w);
		}
		return w;
	}

	/**
	 * Zoom/pan state the labels are laid out for. It follows the map only once a gesture has
	 * settled: while the user is zooming, the label DOM is left untouched and simply moves and
	 * scales with the map layer. Mutating ~240 label elements per frame made every pointer read
	 * by d3-zoom (getScreenCTM) force an expensive style/layout pass, which caused zoom lag.
	 */
	const SETTLE_MS = 150;
	/** Tests can lengthen the delay (window.__geolangSettleMs) to observe a gesture deterministically. */
	const settleMs = () =>
		(globalThis as { __geolangSettleMs?: number }).__geolangSettleMs ?? SETTLE_MS;
	let layout = $state<{ k: number; x: number; y: number; width: number; height: number } | null>(
		null
	);
	let settleTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		const next = { k: ctx.k, x: ctx.x, y: ctx.y, width: ctx.width, height: ctx.height };
		clearTimeout(settleTimer);
		if (!layout || layout.width !== next.width || layout.height !== next.height) {
			layout = next; // first render or resize: lay out immediately
		} else if (layout.k !== next.k || layout.x !== next.x || layout.y !== next.y) {
			settleTimer = setTimeout(() => (layout = next), settleMs());
		}
	});
	$effect(() => () => clearTimeout(settleTimer));

	const lt = $derived(
		layout ?? { k: ctx.k, x: ctx.x, y: ctx.y, width: ctx.width, height: ctx.height }
	);

	// Maps the settled view onto the live one: screen point s -> (s - lt.t) * r + ctx.t
	const gestureTransform = $derived.by(() => {
		const r = ctx.k / lt.k;
		const dx = ctx.x - lt.x * r;
		const dy = ctx.y - lt.y * r;
		if (Math.abs(r - 1) < 1e-6 && Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return 'none';
		return `translate(${dx}px, ${dy}px) scale(${r})`;
	});

	// Large in-gesture scale changes would show stretched, blurry text: fade the layer out until
	// the labels are re-laid out at the new zoom (opacity is compositor-only, so it's free).
	const gestureFaded = $derived(Math.abs(Math.log2(ctx.k / lt.k)) > 0.5);

	// Whole-pixel steps: text is only re-laid out when the size actually changes.
	const px = $derived(Math.round(fontSize(lt.k)));
	const chipGap = 4;

	const items = $derived.by(() => {
		const out: (LabelItem & { label: CountryLabel; textW: number; chipW: number })[] = [];
		for (const label of labels.values()) {
			const anchor = anchors.get(label.iso);
			if (!anchor) continue;
			const font = label.shown?.font ?? 'Noto Sans';
			const textW = (width100(label.text, font) * px) / 100;
			const chipW = label.more ? (width100(`+${label.more}`, 'Noto Sans') * px * 0.8) / 100 + 8 : 0;
			const w = textW + (chipW ? chipGap + chipW : 0);
			out.push({ iso: label.iso, anchor, width: w + 6, height: px * 1.3, label, textW, chipW });
		}
		return out;
	});

	const visible = $derived(
		placeLabels(items, { k: lt.k, x: lt.x, y: lt.y }, { width: lt.width, height: lt.height })
	);
</script>

<!--
	Labels are laid out in screen pixels for the settled zoom state `lt`. While a gesture is in
	progress the whole layer is moved/scaled with a CSS transform (GPU-composited, no layout),
	mapping the settled view onto the live one; it is re-laid out once the gesture settles.
-->
<div
	class="label-layer"
	class:faded={gestureFaded}
	style:transform={gestureTransform}
	data-testid="label-layer"
>
	<svg
		class="labels"
		data-testid="labels"
		data-layout-k={lt.k.toFixed(3)}
		width={lt.width}
		height={lt.height}
		style:font-size={`${px}px`}
		aria-hidden="true"
	>
		{#each items as it (it.iso)}
			{@const l = it.label}
			{@const shown = visible.has(it.iso)}
			{@const totalW = it.textW + (it.chipW ? chipGap + it.chipW : 0)}
			<g
				class="label"
				class:hidden={!shown}
				class:na={l.na}
				class:fallback={l.nativeFallback}
				data-iso={it.iso}
				data-visible={shown ? 'true' : 'false'}
				transform={`translate(${(it.anchor.x * lt.k + lt.x).toFixed(1)},${(it.anchor.y * lt.k + lt.y).toFixed(1)})`}
			>
				<text
					class="word"
					x={(-totalW / 2 + it.textW / 2).toFixed(2)}
					y="0"
					dy="0.35em"
					text-anchor="middle"
					direction={l.shown?.dir ?? 'ltr'}
					unicode-bidi="embed"
					lang={l.shown?.code}
					style:font-family={fontStack(l.shown?.font ?? 'Noto Sans')}
					data-testid={`label-${it.iso}`}
				>
					{l.text}
				</text>
				{#if l.more}
					<g
						class="chip"
						transform={`translate(${(totalW / 2 - it.chipW / 2).toFixed(2)},0)`}
						data-testid={`chip-${it.iso}`}
					>
						<rect
							x={-it.chipW / 2}
							y={-px * 0.55}
							width={it.chipW}
							height={px * 1.1}
							rx={px * 0.55}
						/>
						<text text-anchor="middle" dy="0.35em" style:font-size={`${px * 0.8}px`}>
							+{l.more}
						</text>
					</g>
				{/if}
			</g>
		{/each}
	</svg>
</div>

<style>
	.label-layer {
		position: absolute;
		inset: 0;
		transform-origin: 0 0;
		will-change: transform, opacity;
		pointer-events: none;
		transition: opacity 120ms ease;
	}
	.label-layer.faded {
		opacity: 0;
	}
	@media (prefers-reduced-motion: reduce) {
		.label-layer {
			transition: none;
		}
	}
	.labels {
		display: block;
		overflow: visible;
		font-weight: 600;
	}
	.label.hidden {
		display: none;
	}
	.word {
		fill: var(--label);
		stroke: var(--label-halo);
		stroke-width: 3px;
		stroke-linejoin: round;
		paint-order: stroke;
	}
	.na .word {
		fill: var(--label-na);
		font-weight: 400;
		font-style: italic;
	}
	.fallback .word {
		font-style: italic;
	}
	.chip rect {
		fill: var(--accent);
	}
	.chip text {
		fill: var(--accent-text);
		font-family: 'Noto Sans', sans-serif;
		font-weight: 700;
	}
</style>
