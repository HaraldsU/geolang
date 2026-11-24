<script lang="ts">
	import '../app.css';
	import '#lib/fonts.js';
	import favicon from '#lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { initTheme } from '#lib/theme.svelte.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	onMount(initTheme);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
