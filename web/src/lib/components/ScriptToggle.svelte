<script lang="ts">
	import type { ScriptMode } from '#lib/data/types.js';

	let { value = $bindable<ScriptMode>('latin') }: { value?: ScriptMode } = $props();
</script>

<div class="toggle" role="radiogroup" aria-label="Writing system" data-testid="script-toggle">
	<button
		type="button"
		role="radio"
		aria-checked={value === 'latin'}
		class:active={value === 'latin'}
		onclick={() => (value = 'latin')}
		data-testid="script-latin"
	>
		Latin
	</button>
	<button
		type="button"
		role="radio"
		aria-checked={value === 'native'}
		class:active={value === 'native'}
		onclick={() => (value = 'native')}
		data-testid="script-native"
	>
		Native
	</button>
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
