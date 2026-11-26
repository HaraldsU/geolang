import { describe, expect, it } from 'vitest';
import { absUrl, buildSitemap, jsonLd, SITE_URL, wordPath } from './seo.js';

describe('absUrl', () => {
	it('joins the site origin and a path', () => {
		expect(absUrl('/word/hello')).toBe(`${SITE_URL}/word/hello`);
		expect(absUrl('about')).toBe(`${SITE_URL}/about`);
		expect(absUrl('/')).toBe(`${SITE_URL}/`);
	});
});

describe('wordPath', () => {
	it('builds the word page path from a slug', () => {
		expect(wordPath('hello')).toBe('/word/hello');
		expect(wordPath('thank-you')).toBe('/word/thank-you');
	});
});

describe('jsonLd', () => {
	it('cannot end its script element early', () => {
		const out = jsonLd({ name: '</script><script>alert(1)</script>' });
		expect(out).not.toContain('<');
		expect(JSON.parse(out)).toEqual({ name: '</script><script>alert(1)</script>' });
	});
});

describe('buildSitemap', () => {
	it('lists absolute URLs with optional lastmod', () => {
		const xml = buildSitemap([{ path: '/' }, { path: '/word/hello', lastmod: '2026-11-23' }]);
		expect(xml).toMatch(
			/^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/
		);
		expect(xml).toContain(`<url><loc>${SITE_URL}/</loc></url>`);
		expect(xml).toContain(
			`<url><loc>${SITE_URL}/word/hello</loc><lastmod>2026-11-23</lastmod></url>`
		);
		expect(xml.trimEnd().endsWith('</urlset>')).toBe(true);
	});

	it('escapes XML special characters', () => {
		const xml = buildSitemap([{ path: "/a?b=1&c='d'" }]);
		expect(xml).toContain('/a?b=1&amp;c=&apos;d&apos;');
	});
});
