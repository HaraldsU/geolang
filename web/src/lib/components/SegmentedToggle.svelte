<script lang="ts" generics="T extends string">
	interface Option {
		value: T;
		label: string;
		testid: string;
	}

	let {
		value = $bindable(),
		options,
		label,
		testid
	}: { value: T; options: Option[]; label: string; testid: string } = $props();
</script>

<div class="toggle" role="radiogroup" aria-label={label} data-testid={testid}>
	{#each options as o (o.value)}
		<button
			type="button"
			role="radio"
			aria-checked={value === o.value}
			class:active={value === o.value}
			onclick={() => (value = o.value)}
			data-testid={o.testid}
		>
			{o.label}
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
