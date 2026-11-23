import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { gotoReady, labelText, search, useFixtureData } from './helpers';

async function seriousViolations(page: import('@playwright/test').Page) {
	const results = await new AxeBuilder({ page }).analyze();
	return results.violations
		.filter((v) => v.impact === 'serious' || v.impact === 'critical')
		.map(
			(v) =>
				`${v.id}: ${v.nodes
					.map((n) => n.target.join(' '))
					.slice(0, 3)
					.join(', ')}`
		);
}

test.beforeEach(async ({ page }) => {
	await useFixtureData(page);
});

test('map page has no serious accessibility violations', async ({ page }) => {
	await gotoReady(page);
	expect(await seriousViolations(page)).toEqual([]);
});

test('results view has no serious accessibility violations', async ({ page }) => {
	await gotoReady(page);
	await search(page, 'bank');
	await expect(page.getByTestId('sense-picker')).toBeVisible();
	expect(await seriousViolations(page)).toEqual([]);
});

test('about page has no serious accessibility violations and lists sources', async ({ page }) => {
	await page.goto('/about');
	const sources = page.getByTestId('sources');
	for (const name of ['Wiktionary', 'Wikidata', 'Unicode CLDR', 'Natural Earth', 'CC BY-SA 4.0']) {
		await expect(sources).toContainText(name);
	}
	expect(await seriousViolations(page)).toEqual([]);
	await page.getByRole('link', { name: /back to the map/i }).click();
	await expect(page.getByTestId('world-map')).toBeVisible();
});

test('keyboard-only flow: search and toggle script', async ({ page, isMobile }) => {
	test.skip(isMobile, 'keyboard flow is for desktop/tablet');
	await gotoReady(page);
	await page.keyboard.press('Tab'); // brand link
	await page.keyboard.press('Tab'); // search
	await expect(page.getByTestId('search-input')).toBeFocused();
	await page.keyboard.type('hello');
	await page.keyboard.press('Enter');
	await expect.poll(() => labelText(page, 'RU')).toBe('zdravstvujte');
	await page.getByTestId('search-input').focus();
	await page.keyboard.press('Tab');
	await expect(page.getByTestId('script-latin')).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(page.getByTestId('script-native')).toBeFocused();
	await page.keyboard.press('Enter');
	await expect.poll(() => labelText(page, 'RU')).toBe('здравствуйте');
	await page.keyboard.press('Escape');
});
