import { test, expect, type Page } from '@playwright/test';
import { gotoReady, labelText, search, selectCountry, useFixtureData } from './helpers';

const SCRIPTS: [iso: string, font: string, sample: string][] = [
	['IN', 'Noto Sans Devanagari', 'नमस्ते'],
	['LK', 'Noto Sans Sinhala', 'ආයුබෝවන්'],
	['TH', 'Noto Sans Thai', 'สวัสดี'],
	['SA', 'Noto Sans Arabic', 'مرحبا'],
	['ET', 'Noto Sans Ethiopic', 'ሰላም'],
	['CN', 'Noto Sans SC', '你好'],
	['KR', 'Noto Sans KR', '안녕'],
	['IL', 'Noto Sans Hebrew', 'שלום']
];

const RARE = '𡳞'; // U+21CDE, Hokkien: missing from Google's Noto Sans TC slices

test.beforeEach(async ({ page }) => {
	await useFixtureData(page);
});

test.describe('script fonts', () => {
	test.beforeEach(async ({ page }) => {
		await gotoReady(page, '/?q=hello&script=native');
		await expect.poll(() => labelText(page, 'FR')).toBe('bonjour');
	});

	test('script fonts are loaded for labels that need them', async ({ page }) => {
		await page.evaluate(() => document.fonts.ready);
		for (const [, font, sample] of SCRIPTS) {
			const ok = await page.evaluate(
				async ([f, s]) => {
					await document.fonts.load(`600 16px "${f}"`, s);
					return document.fonts.check(`600 16px "${f}"`, s);
				},
				[font, sample]
			);
			expect(ok, font).toBe(true);
		}
	});

	test('right-to-left labels are marked rtl', async ({ page }) => {
		await expect(page.getByTestId('label-SA')).toHaveAttribute('direction', 'rtl');
		await expect(page.getByTestId('label-IL')).toHaveAttribute('direction', 'rtl');
		await expect(page.getByTestId('label-FR')).toHaveAttribute('direction', 'ltr');
		await expect(page.getByTestId('label-SA')).toHaveAttribute('lang', 'ar');
	});

	test('non-Latin scripts render with proper shaping', async ({ page }, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop-chrome', 'glyph snapshots are taken once');
		for (const [iso] of SCRIPTS) {
			await selectCountry(page, iso);
			const word = page.getByTestId('country-panel').locator('li .word').first();
			await expect(word).toBeVisible();
			await page.evaluate(() => document.fonts.ready);
			await expect(word).toHaveScreenshot(`word-${iso}.png`);
		}
	});
});

/** Pixels of `text` drawn with the font stack of the panel's Min Nan word. */
async function glyphPixels(page: Page, text: string) {
	return page
		.getByTestId('country-panel')
		.locator('li[data-lang="nan"] .word')
		.evaluate(async (el, text) => {
			const font = `600 48px ${getComputedStyle(el).fontFamily}`;
			await document.fonts.load(font, text);
			const ctx = document.createElement('canvas').getContext('2d')!;
			ctx.canvas.width = ctx.canvas.height = 64;
			ctx.font = font;
			ctx.textBaseline = 'top';
			ctx.fillText(text, 4, 4);
			return Array.from(ctx.getImageData(0, 0, 64, 64).data.filter((_, i) => i % 4 === 3));
		}, text);
}

test('rare Han characters render with the fallback font, which loads only when needed', async ({
	page
}) => {
	const fontRequests: string[] = [];
	page.on('request', (r) => {
		if (r.url().includes('/fonts/han-fallback-')) fontRequests.push(r.url());
	});
	await gotoReady(page);
	await search(page, 'hello');
	await expect(page.getByTestId('status')).toHaveAttribute('data-status', 'done');
	expect(fontRequests).toEqual([]);

	await search(page, 'dick');
	await expect(page.getByTestId('status')).toHaveAttribute('data-status', 'done');
	await selectCountry(page, 'TW');
	const row = page.getByTestId('country-panel').locator('li[data-lang="nan"]');
	await expect(row.locator('.word')).toHaveText('𡳞鳥');
	// kaikki's bogus "zh-min-nan" romanization is dropped, and no Mandarin pinyin replaces it
	await expect(row.locator('.latin')).toHaveCount(0);

	await expect.poll(() => fontRequests.length).toBeGreaterThan(0);
	// A real glyph, not the "missing glyph" box an unassigned code point gets
	expect(await glyphPixels(page, RARE)).not.toEqual(await glyphPixels(page, '\u{10FFFF}'));
});
