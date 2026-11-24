<script lang="ts" generics="T extends string">
	interface Option {
		value: T;
		label: string;
		testid: string;
		/** SVG path data (24×24 viewBox): shown instead of the label, which becomes its name */
		icon?: string;
	}

	let {
		value = $bindable(),
		options,
		label,
		testid,
		onchange
	}: {
		value: T;
		options: Option[];
		label: string;
		testid: string;
		onchange?: (value: T) => void;
	} = $props();
</script>

<div class="toggle" role="radiogroup" aria-label={label} data-testid={testid}>
	{#each options as o (o.value)}
		<button
			type="button"
			role="radio"
			aria-checked={value === o.value}
			class:active={value === o.value}
			class:icon={o.icon}
			aria-label={o.icon ? o.label : undefined}
			title={o.icon ? o.label : undefined}
			onclick={() => {
				value = o.value;
				onchange?.(o.value);
			}}
			data-testid={o.testid}
		>
			{#if o.icon}
				<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
					<path d={o.icon} />
				</svg>
			{:else}
				{o.label}
			{/if}
		</button>
	{/each}
</div>

<style>
	.toggle {
		display: inline-flex;
		padding: 3px;
		gap: 2px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 999px;
	}
	button {
		min-width: 64px;
		min-height: 38px;
		padding: 0 14px;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--text-muted);
		font-weight: 600;
		font-size: 0.9rem;
		white-space: nowrap;
		cursor: pointer;
	}
	button.icon {
		display: inline-grid;
		place-items: center;
		min-width: 44px;
		padding: 0 10px;
	}
	svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	button.active {
		background: var(--accent);
		color: var(--accent-text);
	}
	@media (max-width: 767px), (pointer: coarse) {
		button {
			min-height: 44px;
		}
	}
</style>
