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

	// Anchors depend only on the projection (i.e. viewport size), not on zoom.
	const anchors = $derived.by(() => {
		const out = new Map<string, Anchor>();
		for (const f of ctx.features) {
			const a = computeAnchor(f.id, f, ctx.projection);
			if (a) out.set(f.id, a);
		}
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

	const px = $derived(fontSize(ctx.k));
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
		placeLabels(items, { k: ctx.k, x: ctx.x, y: ctx.y }, { width: ctx.width, height: ctx.height })
	);
</script>

<g class="labels" data-testid="labels" style:font-size={`${px / ctx.k}px`}>
	{#each items as it (it.iso)}
		{@const l = it.label}
		{@const s = 1 / ctx.k}
		{@const totalW = it.textW + (it.chipW ? chipGap + it.chipW : 0)}
		<g
			class="label"
			class:hidden={!visible.has(it.iso)}
			class:na={l.na}
			class:fallback={l.nativeFallback}
			data-iso={it.iso}
			data-visible={visible.has(it.iso) ? 'true' : 'false'}
			transform={`translate(${it.anchor.x},${it.anchor.y})`}
		>
			<text
				class="word"
				x={((-totalW / 2 + it.textW / 2) * s).toFixed(3)}
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
					transform={`translate(${((totalW / 2 - it.chipW / 2) * s).toFixed(3)},0)`}
					data-testid={`chip-${it.iso}`}
				>
					<rect
						x={(-it.chipW / 2) * s}
						y={-px * 0.55 * s}
						width={it.chipW * s}
						height={px * 1.1 * s}
						rx={px * 0.55 * s}
					/>
					<text text-anchor="middle" dy="0.35em" style:font-size={`${(px * 0.8) / ctx.k}px`}>
						+{l.more}
					</text>
				</g>
			{/if}
		</g>
	{/each}
</g>

<style>
	.labels {
		pointer-events: none;
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
		vector-effect: non-scaling-stroke;
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
