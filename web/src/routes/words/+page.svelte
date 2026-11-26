<script lang="ts">
	import Seo from '#lib/components/Seo.svelte';
	import { wordPath } from '#lib/seo.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/** words grouped by first letter, A–Z */
	const groups = $derived.by(() => {
		const by = new Map<string, typeof data.words>();
		for (const w of data.words) {
			const k = w.word[0].toUpperCase();
			by.set(k, [...(by.get(k) ?? []), w]);
		}
		return [...by];
	});
</script>

<Seo
	title="Common words in every country’s language | geolang"
	description="Hundreds of common words (hello, water, love, friend…) in the official languages of every country: pick one to see it country by country and on a world map."
	path="/words"
/>

<main class="page" data-testid="words-page">
	<a class="back" href="/">← Back to the map</a>
	<h1>Common words in every country’s language</h1>
	<p>
		Each page lists one word in the national official languages of every country, with
		romanizations. To look up any other word, <a href="/">search on the map</a>.
	</p>
	{#if groups.length}
		<nav class="letters" aria-label="Letters">
			{#each groups as [letter] (letter)}
				<a href="#{letter}">{letter}</a>
			{/each}
		</nav>
		{#each groups as [letter, words] (letter)}
			<h2 id={letter}>{letter}</h2>
			<ul class="list">
				{#each words as w (w.slug)}
					<li><a href={wordPath(w.slug)}>{w.word}</a></li>
				{/each}
			</ul>
		{/each}
	{:else}
		<p class="muted">No word pages in this build (the translation data has not been built).</p>
	{/if}
</main>

<style>
	.page {
		max-width: 860px;
		margin: 0 auto;
		padding: 16px 16px 48px;
		line-height: 1.6;
	}
	a {
		color: var(--accent);
	}
	.back {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
	}
	h1 {
		margin: 8px 0;
		font-size: 1.8rem;
		line-height: 1.25;
	}
	h2 {
		margin: 24px 0 4px;
		font-size: 1.2rem;
		border-bottom: 1px solid var(--border);
	}
	.letters {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.letters a {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 44px;
		min-height: 44px;
	}
	.list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 0 16px;
		padding: 0;
		list-style: none;
	}
	.list a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
	}
	.muted {
		color: var(--text-muted);
	}
	:global(html),
	:global(body) {
		height: auto;
	}
</style>
