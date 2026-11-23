<svelte:head>
	<title>About geolang</title>
	<meta name="description" content="How geolang works and where its data comes from." />
</svelte:head>

<main class="about" data-testid="about">
	<a class="back" href="/">← Back to the map</a>
	<h1>About geolang</h1>
	<p>
		Type a word and geolang shows how it is written in the national official language(s) of every
		country. Labels can be shown in Latin script (romanized) or in each language’s own script. Where
		no translation is known, the country shows <em>N/A</em>.
	</p>
	<p>
		All data is prepared ahead of time from open dictionaries; nothing you type leaves your browser
		other than requests for static data files. There are no accounts and no tracking cookies.
	</p>

	<h2>Sources &amp; licences</h2>
	<ul data-testid="sources">
		<li>
			<strong>Translations</strong>:
			<a href="https://en.wiktionary.org/" rel="noopener">Wiktionary</a> translation tables,
			extracted by <a href="https://kaikki.org/" rel="noopener">kaikki.org</a> (wiktextract).
			Licensed
			<a href="https://creativecommons.org/licenses/by-sa/4.0/" rel="noopener">CC BY-SA 4.0</a>; the
			derived translation data on this site is shared under the same licence.
		</li>
		<li>
			<strong>Supplementary labels</strong>:
			<a href="https://www.wikidata.org/" rel="noopener">Wikidata</a> (CC0).
		</li>
		<li>
			<strong>Official languages</strong>:
			<a href="https://cldr.unicode.org/" rel="noopener">Unicode CLDR</a> territory data (Unicode License
			v3), with manual corrections.
		</li>
		<li>
			<strong>Map</strong>:
			<a href="https://www.naturalearthdata.com/" rel="noopener">Natural Earth</a> (public domain) via
			world-atlas.
		</li>
		<li>
			<strong>Fonts</strong>: <a href="https://fonts.google.com/noto" rel="noopener">Noto</a> (SIL Open
			Font License).
		</li>
	</ul>
	<p class="muted">
		Borders and names follow Natural Earth’s conventions and do not imply any position on disputed
		territories.
	</p>
</main>

<style>
	.about {
		max-width: 720px;
		margin: 0 auto;
		padding: 24px 16px 48px;
		line-height: 1.6;
	}
	h1 {
		margin: 16px 0 8px;
		font-size: 1.8rem;
	}
	h2 {
		margin-top: 28px;
		font-size: 1.2rem;
	}
	a {
		color: var(--accent);
	}
	.back {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
	}
	li {
		margin-bottom: 8px;
	}
	.muted {
		color: var(--text-muted);
		font-size: 0.9rem;
	}
	:global(html),
	:global(body) {
		height: auto;
	}
</style>
