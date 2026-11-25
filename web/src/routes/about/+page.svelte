<script lang="ts">
	import { mapUrl } from '#lib/map-url.js';
</script>

<svelte:head>
	<title>About geolang</title>
	<meta name="description" content="How geolang works and where its data comes from." />
</svelte:head>

<main class="about" data-testid="about">
	<a class="back" href={mapUrl()}>← Back to the map</a>
	<h1>About geolang</h1>
	<p>
		Type a word and geolang shows how it is written in the national official language(s) of every
		country. Labels can be shown in Latin script (romanized) or in each language’s own script. Where
		no translation is known, the country shows <em>N/A</em>.
	</p>
	<p data-testid="map-legend">
		Countries that have the word are tinted. When a country is too small for its label at the
		current zoom, a dot marks it instead (a hollow ring means <em>N/A</em>); zoom in or tap the
		country to see the word.
	</p>
	<p data-testid="accuracy-note">
		Translations come from Wiktionary, a dictionary written by volunteers, and are shown as listed
		there without further checking, so some may be wrong, unusual or misspelled. If you spot one,
		select the country and use <em>Report a wrong translation</em>.
	</p>
	<p>
		All data is prepared ahead of time from open dictionaries; nothing you type leaves your browser
		other than requests for static data files and the analytics described below. There are no
		accounts and no cookies.
	</p>
	<p data-testid="analytics-note">
		Visits are counted with Cloudflare Web Analytics, which records anonymous page views (such as
		the country and browser) without cookies or fingerprinting. A page view includes the page
		address, which holds the current search (<code>?q=…</code>), so searched words can appear in
		these statistics.
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
			<a href="https://www.naturalearthdata.com/" rel="noopener">Natural Earth</a> 1:50m, version 5.1.1
			(public domain), with borders redrawn as described below.
		</li>
		<li>
			<strong>Fonts</strong>: <a href="https://fonts.google.com/noto" rel="noopener">Noto</a>, and
			for rare Chinese characters
			<a
				href="https://github.com/Fitzgerald-Porthmouth-Koenigsegg/Plangothic_Project"
				rel="noopener"
			>
				Plangothic
			</a> (both SIL Open Font License).
		</li>
	</ul>
	<h2>Borders</h2>
	<p>
		Borders follow international law as reflected in UN resolutions, because a country’s border
		decides which official language is shown:
	</p>
	<ul>
		<li>
			Where a UN General Assembly or Security Council resolution settles which country an area
			belongs to, it is shown as part of that country, even where another country controls it:
			Crimea is shown in Ukraine, the Golan Heights in Syria, Northern Cyprus in Cyprus. The same
			applies to breakaway regions that no UN member state recognises, such as Abkhazia, South
			Ossetia, Transnistria and Somaliland. Western Sahara is shown whole, as the UN lists it as a
			non-self-governing territory.
		</li>
		<li>
			Where there is no settled answer, as in Kashmir, an area is shown as part of the country that
			administers it.
		</li>
		<li>Kosovo and Taiwan are shown separately, as in the ISO 3166 country list.</li>
	</ul>
	<p class="muted">
		Dashed lines outline disputed areas. The panel of each country involved explains the dispute.
		This does not imply any position on the disputes themselves.
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
