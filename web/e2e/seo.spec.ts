import { test, expect, type Page } from '@playwright/test';
import { gotoReady, labelText, useFixtureData } from './helpers';

// Word pages are prerendered from the fixture data (GEOLANG_DATA_DIR in playwright.config.ts).
const SITE = 'https://geolang.pages.dev';
const FIXTURE_WORDS = ['dog', 'hello', 'water'];

async function head(page: Page) {
	return page.evaluate(() => {
		const meta = (sel: string) =>
			[...document.querySelectorAll<HTMLMetaElement>(sel)].map((m) => m.content);
		return {
			title: document.title,
			descriptions: meta('meta[name="description"]'),
			canonical: [...document.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]')].map(
				(l) => l.href
			),
			ogTitle: meta('meta[property="og:title"]'),
			ogUrl: meta('meta[property="og:url"]'),
			ogImage: meta('meta[property="og:image"]'),
			twitterCard: meta('meta[name="twitter:card"]'),
			jsonLd: [
				...document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')
			].map((s) => JSON.parse(s.textContent!))
		};
	});
}

/** CSP violations reported while `fn` runs (the browser logs them as console errors). */
async function cspViolations(page: Page, fn: () => Promise<void>) {
	const errors: string[] = [];
	page.on('console', (m) => {
		if (m.type() === 'error' && /Content[- ]Security[- ]Policy/i.test(m.text()))
			errors.push(m.text());
	});
	await fn();
	return errors;
}

test('the home page has a descriptive title, canonical URL, share tags and structured data', async ({
	page,
	request
}) => {
	await gotoReady(page);
	const h = await head(page);
	expect(h.title).toContain('every country');
	expect(h.descriptions).toHaveLength(1);
	expect(h.descriptions[0].length).toBeGreaterThan(80);
	expect(h.canonical).toEqual([`${SITE}/`]);
	expect(h.ogUrl).toEqual([`${SITE}/`]);
	expect(h.ogTitle).toEqual([h.title]);
	expect(h.twitterCard).toEqual(['summary_large_image']);
	expect(h.ogImage).toEqual([`${SITE}/og.png`]);
	const types = h.jsonLd.flatMap((d) => d['@graph'].map((n: { '@type': string }) => n['@type']));
	expect(types).toEqual(['WebSite', 'WebApplication']);

	await expect(page.locator('meta[name="google-site-verification"]')).toHaveAttribute(
		'content',
		'VOgmt1hJx3jc0kOsdJaEkLVC_HvXWmXWeGczzx2fLzc'
	);

	const img = await request.get('/og.png');
	expect(img.ok()).toBe(true);
	expect(img.headers()['content-type']).toBe('image/png');

	// one h1 for search engines and screen readers, hidden visually
	const h1 = page.locator('h1');
	await expect(h1).toHaveCount(1);
	await expect(h1).toContainText('every country');
});

test('a search keeps the canonical URL of the home page', async ({ page }) => {
	await useFixtureData(page);
	await gotoReady(page, '/?q=hello');
	expect((await head(page)).canonical).toEqual([`${SITE}/`]);
});

test('robots.txt points to the sitemap, which lists every page', async ({ request }) => {
	const robots = await (await request.get('/robots.txt')).text();
	expect(robots).toContain(`Sitemap: ${SITE}/sitemap.xml`);
	expect(robots).toMatch(/User-agent: \*\nDisallow:\n/);

	const res = await request.get('/sitemap.xml');
	expect(res.ok()).toBe(true);
	const xml = await res.text();
	const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
	expect(locs).toEqual(
		expect.arrayContaining([
			`${SITE}/`,
			`${SITE}/about`,
			`${SITE}/words`,
			...FIXTURE_WORDS.map((w) => `${SITE}/word/${w}`)
		])
	);
	expect(new Set(locs).size).toBe(locs.length);
});

test('every word page in the sitemap is served', async ({ request }) => {
	const xml = await (await request.get('/sitemap.xml')).text();
	const paths = [...xml.matchAll(/<loc>[^<]*?(\/word\/[^<]+)<\/loc>/g)].map((m) => m[1]);
	expect(paths.length).toBeGreaterThanOrEqual(FIXTURE_WORDS.length);
	for (const path of paths) expect((await request.get(path)).ok(), path).toBe(true);
});

test('a word page lists the word by country as plain HTML', async ({ page }) => {
	const errors = await cspViolations(page, async () => {
		await page.goto('/word/hello');
	});
	expect(errors).toEqual([]);

	await expect(page.getByRole('heading', { level: 1 })).toHaveText(
		'“hello” in every country’s official languages'
	);
	const h = await head(page);
	expect(h.title).toBe('Hello in different languages: every country’s word | geolang');
	expect(h.canonical).toEqual([`${SITE}/word/hello`]);
	expect(h.descriptions).toHaveLength(1);
	expect(h.descriptions[0]).toContain('French “bonjour”');
	const types = h.jsonLd.flatMap((d) => d['@graph'].map((n: { '@type': string }) => n['@type']));
	expect(types).toEqual(['DefinedTerm', 'BreadcrumbList']);

	// the translations are in the HTML, each marked with its language
	const france = page.getByTestId('country-FR');
	await expect(france).toContainText('France');
	await expect(france.locator('span[lang="fr"]')).toHaveText('bonjour');
	await expect(page.getByTestId('country-RU').locator('span[lang="ru"]')).toHaveAttribute(
		'dir',
		'ltr'
	);
	await expect(page.getByTestId('country-SA').locator('span[lang="ar"]')).toHaveAttribute(
		'dir',
		'rtl'
	);
	await expect(page.locator('td.na').first()).toHaveText('N/A');

	// no JavaScript is needed (or loaded) to read the page
	expect(await page.locator('script[type="module"], script[src*="/_app/"]').count()).toBe(0);
});

test('a word page has no horizontal scroll', async ({ page }) => {
	await page.goto('/word/hello');
	const { scroll, client } = await page.evaluate(() => ({
		scroll: document.documentElement.scrollWidth,
		client: document.documentElement.clientWidth
	}));
	expect(scroll).toBeLessThanOrEqual(client);
});

test('a word page links to the map, the word list and its neighbours', async ({ page }) => {
	await useFixtureData(page);
	await page.goto('/word/hello');
	await expect(page.locator('a[rel="prev"]')).toHaveAttribute('href', '/word/dog');
	await expect(page.locator('a[rel="next"]')).toHaveAttribute('href', '/word/water');
	await page.getByTestId('open-map').click();
	await expect(page).toHaveURL(/\/\?q=hello$/);
	await expect(page.getByTestId('world-map')).toHaveAttribute('data-ready', 'true');
	await expect.poll(() => labelText(page, 'FR')).toBe('bonjour');
});

test('the word list links to every word page, and the home page links to it', async ({ page }) => {
	await gotoReady(page);
	await page.getByRole('link', { name: 'Common words' }).click();
	await expect(page).toHaveURL(/\/words$/);
	await expect(page.getByTestId('words-page')).toBeVisible();
	const hrefs = await page
		.getByTestId('words-page')
		.locator('a[href^="/word/"]')
		.evaluateAll((as) => as.map((a) => a.getAttribute('href')));
	expect(hrefs).toEqual(expect.arrayContaining(FIXTURE_WORDS.map((w) => `/word/${w}`)));
	expect((await head(page)).canonical).toEqual([`${SITE}/words`]);
});
