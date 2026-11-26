<script lang="ts">
	import { absUrl, jsonLd, SITE_NAME } from '#lib/seo.js';

	interface Props {
		title: string;
		description: string;
		/** site path of the page's canonical URL, e.g. "/word/hello" */
		path: string;
		type?: 'website' | 'article';
		/** structured data (schema.org), emitted as JSON-LD */
		schema?: unknown;
	}

	let { title, description, path, type = 'website', schema }: Props = $props();

	const url = $derived(absUrl(path));
	const image = absUrl('/og.png');
	// A data block, not a script that runs: the CSP doesn't apply to it. Built as a string because
	// Svelte doesn't render {expressions} inside <script>.
	const ld = $derived(
		schema ? `<script type="application/ld+json">${jsonLd(schema)}</` + 'script>' : ''
	);
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={url} />
	<meta property="og:type" content={type} />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={url} />
	<meta property="og:image" content={image} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta
		property="og:image:alt"
		content="A world map showing the word “hello” in each country’s language and script"
	/>
	<meta property="og:locale" content="en" />
	<meta name="twitter:card" content="summary_large_image" />
	{#if ld}
		{@html ld}
	{/if}
</svelte:head>
