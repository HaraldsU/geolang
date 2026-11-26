/** Search-engine metadata: the site's public address, structured data and the sitemap. */

/** Public origin of the site: canonical links, Open Graph URLs and the sitemap use it. */
export const SITE_URL = 'https://geolang.pages.dev';
export const SITE_NAME = 'geolang';

/** Absolute URL of a site path ("/word/hello" → "https://geolang.pages.dev/word/hello"). */
export function absUrl(path: string): string {
	return SITE_URL + (path.startsWith('/') ? path : `/${path}`);
}

/**
 * JSON-LD for a `<script type="application/ld+json">`. `<` is escaped so that no value (say a
 * word containing "</script>") can end the script element early.
 */
export function jsonLd(data: unknown): string {
	return JSON.stringify(data).replace(/</g, '\\u003c');
}

/** Path of the prerendered page of a word, by its slug ("thank-you"). */
export function wordPath(slug: string): string {
	return `/word/${encodeURIComponent(slug)}`;
}

export interface SitemapEntry {
	path: string;
	/** YYYY-MM-DD */
	lastmod?: string;
}

function xmlEscape(s: string): string {
	return s.replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!
	);
}

/** A sitemaps.org XML sitemap of the given site paths. */
export function buildSitemap(entries: SitemapEntry[]): string {
	const urls = entries.map(({ path, lastmod }) => {
		const mod = lastmod ? `<lastmod>${xmlEscape(lastmod)}</lastmod>` : '';
		return `<url><loc>${xmlEscape(absUrl(path))}</loc>${mod}</url>`;
	});
	return (
		'<?xml version="1.0" encoding="UTF-8"?>\n' +
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
		urls.join('\n') +
		'\n</urlset>\n'
	);
}
