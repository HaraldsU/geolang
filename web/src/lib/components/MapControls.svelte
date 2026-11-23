<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		onzoomin: () => void;
		onzoomout: () => void;
		onreset: () => void;
		fullscreenTarget: () => HTMLElement | undefined;
	}
	let { onzoomin, onzoomout, onreset, fullscreenTarget }: Props = $props();

	let canFullscreen = $state(false);
	let isFullscreen = $state(false);

	onMount(() => {
		canFullscreen = !!document.fullscreenEnabled;
		const onChange = () => (isFullscreen = !!document.fullscreenElement);
		document.addEventListener('fullscreenchange', onChange);
		return () => document.removeEventListener('fullscreenchange', onChange);
	});

	async function toggleFullscreen() {
		if (document.fullscreenElement) {
			await document.exitFullscreen();
		} else {
			await fullscreenTarget()?.requestFullscreen();
		}
	}
</script>

<div class="controls" data-testid="map-controls">
	<button
		type="button"
		aria-label="Zoom in"
		title="Zoom in"
		onclick={onzoomin}
		data-testid="zoom-in"
	>
		<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
	</button>
	<button
		type="button"
		aria-label="Zoom out"
		title="Zoom out"
		onclick={onzoomout}
		data-testid="zoom-out"
	>
		<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
	</button>
	<button
		type="button"
		aria-label="Reset view"
		title="Reset view"
		onclick={onreset}
		data-testid="zoom-reset"
	>
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<circle cx="12" cy="12" r="8" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
		</svg>
	</button>
	{#if canFullscreen}
		<button
			type="button"
			aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
			aria-pressed={isFullscreen}
			title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
			onclick={toggleFullscreen}
			data-testid="fullscreen"
		>
			{#if isFullscreen}
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
				</svg>
			{:else}
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
				</svg>
			{/if}
		</button>
	{/if}
</div>

<style>
	.controls {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	button {
		width: 44px;
		height: 44px;
		display: grid;
		place-items: center;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		box-shadow: var(--shadow);
		cursor: pointer;
	}
	button:hover {
		background: var(--surface-2);
	}
	svg {
		width: 20px;
		height: 20px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
