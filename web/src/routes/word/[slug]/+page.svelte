<script lang="ts">
	import Seo from '#lib/components/Seo.svelte';
	import { fontStack } from '#lib/fonts.js';
	import { absUrl, SITE_NAME, wordPath } from '#lib/seo.js';
	import { REPORT_REPO } from '#lib/data/report.js';
	import type { LanguageForm } from '#lib/data/country-labels.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const word = $derived(data.word);
	const Word = $derived(word.charAt(0).toUpperCase() + word.slice(1));
	const path = $derived(wordPath(data.slug));

	/** "hola", or "こんにちは (konnichiwa)" for a language not written in Latin script */
	function spelled(f: LanguageForm): string {
		return f.latin && f.latin !== f.native ? `${f.native} (${f.latin})` : f.native!;
	}

	/** a few widely known languages, as examples for the description */
	const EXAMPLES = ['es', 'fr', 'de', 'ja', 'ar', 'ru', 'zh'];
	const description = $derived.by(() => {
		const forms = new Map<string, LanguageForm>();
		for (const r of data.rows) for (const f of r.forms) if (f.native) forms.set(f.code, f);
		const examples = EXAMPLES.map((c) => forms.get(c))
			.filter((f) => f !== undefined)
			.slice(0, 3)
			.map((f) => `${f.name} “${spelled(f)}”`);
		const lead = examples.length ? `${Word} in ${examples.join(', ')} and more. ` : '';
		return `${lead}See the word for “${word}” in the official languages of ${data.covered} countries, with romanizations, on a world map.`;
	});

	const schema = $derived({
		'@context': 'https://schema.org',
		'@graph': [
			{
				'@type': 'DefinedTerm',
				name: word,
				description: data.concept.gloss,
				url: absUrl(path),
				inDefinedTermSet: absUrl('/words')
			},
			{
				'@type': 'BreadcrumbList',
				itemListElement: [
					{ '@type': 'ListItem', position: 1, name: SITE_NAME, item: absUrl('/') },
					{ '@type': 'ListItem', position: 2, name: 'Words', item: absUrl('/words') },
					{ '@type': 'ListItem', position: 3, name: word, item: absUrl(path) }
				]
			}
		]
	});

	const mapHref = $derived(`/?q=${encodeURIComponent(word)}`);
	const reportHref = $derived(
		`${REPORT_REPO}/issues/new?title=${encodeURIComponent(`Translation: "${word}"`)}`
	);
</script>

<Seo
	title="{Word} in different languages: every country’s word | geolang"
	{description}
	{path}
	type="article"
	{schema}
/>

<main class="page" data-testid="word-page">
	<nav class="crumbs" aria-label="Breadcrumb">
		<a href="/">geolang</a> › <a href="/words">Words</a> › <span aria-current="page">{word}</span>
	</nav>

	<h1>“{word}” in every country’s official languages</h1>
	<p class="intro">
		How to say <strong>{word}</strong>
		<span class="gloss">({data.concept.pos}: {data.concept.gloss})</span> in the national official
		languages of every country. {data.covered} of {data.rows.length} countries have a translation; where
		none is known the table shows <em>N/A</em>.
	</p>
	<p>
		<a class="cta" href={mapHref} data-testid="open-map">See “{word}” on the world map</a>
	</p>

	<table class="words" data-testid="word-table">
		<thead>
			<tr>
				<th scope="col">Country</th>
				<th scope="col">Language</th>
				<th scope="col">Word</th>
				<th scope="col">Romanization</th>
			</tr>
		</thead>
		{#each data.rows as row (row.iso)}
			<tbody data-testid="country-{row.iso}">
				{#each row.forms as f, i (f.code)}
					<tr>
						{#if i === 0}
							<th scope="rowgroup" rowspan={row.forms.length} class="country">{row.country}</th>
						{/if}
						<td class="lang">{f.name}</td>
						{#if f.native}
							<td class="word">
								<span lang={f.code} dir={f.dir} style:font-family={fontStack(f.font)}>
									{f.native}
								</span>
							</td>
							<td class="latin">{f.latin && f.latin !== f.native ? f.latin : ''}</td>
						{:else}
							<td class="word na">N/A</td>
							<td class="latin"></td>
						{/if}
					</tr>
				{/each}
			</tbody>
		{/each}
	</table>

	{#if data.otherSenses.length}
		<h2>Other meanings of “{word}”</h2>
		<p>
			The table shows the most common sense. The map can also show <strong>{word}</strong> as:
		</p>
		<ul data-testid="other-senses">
			{#each data.otherSenses as s, i (i)}
				<li><em>{s.pos}</em>: {s.gloss}</li>
			{/each}
		</ul>
		<p><a href={mapHref}>Open “{word}” on the map</a> and pick the meaning there.</p>
	{/if}

	<nav class="pager" aria-label="More words">
		<a href={wordPath(data.prev.slug)} rel="prev">← {data.prev.word}</a>
		<a href="/words">All words</a>
		<a href={wordPath(data.next.slug)} rel="next">{data.next.word} →</a>
	</nav>

	<p class="muted">
		Translations from <a href="https://en.wiktionary.org/" rel="noopener">Wiktionary</a>
		(<a href="https://creativecommons.org/licenses/by-sa/4.0/" rel="noopener">CC BY-SA 4.0</a>),
		shown as listed there for each country’s national official languages.
		<a href={reportHref} rel="noopener">Report a wrong translation</a> ·
		<a href="/about">About geolang</a>
	</p>
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
	.crumbs {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		min-height: 44px;
		color: var(--text-muted);
	}
	.crumbs a {
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
		margin-top: 28px;
		font-size: 1.2rem;
	}
	.gloss,
	.muted {
		color: var(--text-muted);
	}
	.muted {
		margin-top: 28px;
		font-size: 0.9rem;
	}
	.cta {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 18px;
		border-radius: var(--radius);
		background: var(--accent);
		color: var(--accent-text);
		font-weight: 600;
		text-decoration: none;
	}
	.words {
		width: 100%;
		border-collapse: collapse;
		margin-top: 16px;
		background: var(--surface);
		border-radius: var(--radius);
		overflow: hidden;
		box-shadow: var(--shadow);
	}
	th,
	td {
		padding: 6px 12px;
		text-align: start;
		vertical-align: top;
	}
	thead th {
		background: var(--surface-2);
		font-size: 0.9rem;
	}
	tbody {
		border-top: 1px solid var(--border);
	}
	.country {
		font-weight: 600;
	}
	.word {
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.na,
	.latin,
	.lang {
		color: var(--text-muted);
	}
	.latin {
		overflow-wrap: anywhere;
	}
	.pager {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		margin-top: 28px;
	}
	.pager a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
	}
	:global(html),
	:global(body) {
		height: auto;
	}

	/* phones: one card per country instead of four columns */
	@media (max-width: 599px) {
		h1 {
			font-size: 1.5rem;
		}
		.words thead {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
		}
		.words,
		.words tbody,
		.words tr,
		.words th,
		.words td {
			display: block;
		}
		.words tbody {
			padding: 8px 0;
		}
		.words tr {
			display: grid;
			grid-template-columns: 1fr auto;
			column-gap: 12px;
		}
		.country {
			grid-column: 1 / -1;
			padding-bottom: 0;
		}
		.lang {
			grid-column: 1 / -1;
			padding-bottom: 0;
			font-size: 0.85rem;
		}
		.word,
		.latin {
			padding-top: 0;
		}
		.latin {
			text-align: end;
		}
	}
</style>
