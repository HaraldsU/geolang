import { test, expect } from '@playwright/test';
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

test.beforeEach(async ({ page }) => {
	await useFixtureData(page);
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
