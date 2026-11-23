<script lang="ts">
	import type { LanguageForm } from '#lib/data/country-labels.js';
	import type { ScriptMode } from '#lib/data/types.js';
	import { fontStack } from '#lib/fonts.js';

	interface Props {
		iso: string;
		name: string;
		forms: LanguageForm[];
		mode: ScriptMode;
		hasConcept: boolean;
		variant: 'panel' | 'tooltip';
		onclose?: () => void;
	}
	let { iso, name, forms, mode, hasConcept, variant, onclose }: Props = $props();
</script>

<section
	class="panel {variant}"
	data-testid={variant === 'panel' ? 'country-panel' : 'country-tooltip'}
	data-iso={iso}
	aria-label={`${name}: official languages`}
	role={variant === 'panel' ? 'dialog' : 'tooltip'}
>
	<header>
		<h2>{name}</h2>
		{#if onclose}
			<button
				type="button"
				class="close"
				aria-label="Close"
				onclick={onclose}
				data-testid="panel-close"
			>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
			</button>
		{/if}
	</header>
	{#if !forms.length}
		<p class="muted">No official language listed.</p>
	{:else}
		<ul>
			{#each forms as f (f.code)}
				<li data-lang={f.code}>
					<span class="lang">{f.name}</span>
					{#if hasConcept}
						{#if f.native}
							<span class="forms">
								<span
									class="word"
									class:primary={mode === 'native' || !f.latin}
									dir={f.dir}
									lang={f.code}
									style:font-family={fontStack(f.font)}
								>
									{f.native}
								</span>
								{#if f.latin && f.latin !== f.native}
									<span class="latin" class:primary={mode === 'latin'}>{f.latin}</span>
								{/if}
							</span>
						{:else}
							<span class="na">N/A</span>
						{/if}
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.panel {
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
		padding: 12px 14px;
		min-width: 200px;
		max-width: min(360px, calc(100vw - 32px));
	}
	.tooltip {
		pointer-events: none;
		padding: 8px 12px;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	h2 {
		margin: 0;
		font-size: 1rem;
		font-weight: 800;
	}
	.tooltip h2 {
		font-size: 0.95rem;
	}
	ul {
		list-style: none;
		margin: 8px 0 0;
		padding: 0;
		display: grid;
		gap: 6px;
	}
	li {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 16px;
	}
	.lang {
		color: var(--text-muted);
		font-size: 0.85rem;
		white-space: nowrap;
	}
	.forms {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		text-align: right;
		min-width: 0;
	}
	.word,
	.latin {
		overflow-wrap: anywhere;
	}
	.word {
		font-weight: 600;
	}
	.latin {
		color: var(--text-muted);
		font-size: 0.85rem;
	}
	.latin.primary {
		color: var(--text);
		font-size: 0.95rem;
		font-weight: 600;
	}
	.na,
	.muted {
		color: var(--label-na);
		font-style: italic;
	}
	.muted {
		margin: 6px 0 0;
		font-size: 0.85rem;
	}
	.close {
		width: 44px;
		height: 44px;
		margin: -10px -10px -10px 0;
		display: grid;
		place-items: center;
		border: 0;
		background: transparent;
		border-radius: 999px;
		cursor: pointer;
	}
	.close:hover {
		background: var(--surface-2);
	}
	.close svg {
		width: 20px;
		height: 20px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
	}
</style>
