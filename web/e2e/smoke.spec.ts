import { test, expect } from '@playwright/test';
import { gotoReady } from './helpers';

test('page loads with title and no console errors', async ({ page }) => {
	const errors: string[] = [];
	page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
	page.on('pageerror', (e) => errors.push(e.message));

	await gotoReady(page);
	await expect(page).toHaveTitle('geolang');
	await expect(page.getByTestId('navbar')).toBeVisible();
	expect(errors).toEqual([]);
});

test('the favicon is the lagoon globe with 文', async ({ page }) => {
	await gotoReady(page);
	const href = await page.locator('link[rel="icon"]').getAttribute('href');
	expect(href).toBeTruthy();
	const svg = await page.evaluate((h) => fetch(h).then((r) => r.text()), href!);
	expect(svg).toContain('<title>geolang</title>');
	expect(svg).toContain('fill="#138a8a"');
});
