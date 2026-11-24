import { test, expect, type Page } from '@playwright/test';
import { canvasColorAt, cssColor, gotoReady, isMobile } from './helpers';

const theme = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme);
const themeColor = (page: Page) => page.locator('meta[name="theme-color"]').getAttribute('content');

test('follows the system preference until a theme is picked', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'dark' });
	await gotoReady(page);
	expect(await theme(page)).toBe('dark');
	await expect(page.getByTestId('theme-dark')).toHaveAttribute('aria-checked', 'true');
	expect(await themeColor(page)).toBe(await cssColor(page, '--bg'));

	await page.emulateMedia({ colorScheme: 'light' });
	await expect.poll(() => theme(page)).toBe('light');
	await expect(page.getByTestId('theme-light')).toHaveAttribute('aria-checked', 'true');
	expect(await themeColor(page)).toBe('#f4f1ea');
});

test('picking a theme recolours the page and the map, and is remembered', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'dark' });
	await gotoReady(page);
	const darkLand = await canvasColorAt(page, 'LY');

	await page.getByTestId('theme-light').click();
	expect(await theme(page)).toBe('light');
	await expect(page.getByTestId('theme-light')).toHaveAttribute('aria-checked', 'true');
	await expect(page.getByTestId('theme-dark')).toHaveAttribute('aria-checked', 'false');
	const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
	expect(bg).toBe('rgb(244, 241, 234)');
	await expect.poll(() => canvasColorAt(page, 'LY')).not.toBe(darkLand);
	await expect.poll(() => canvasColorAt(page, 'LY')).toBe(await cssColor(page, '--land'));

	// the choice now wins over the system preference, after a reload and on other pages
	await page.emulateMedia({ colorScheme: 'dark' });
	await page.waitForTimeout(100);
	expect(await theme(page)).toBe('light');
	await gotoReady(page);
	expect(await theme(page)).toBe('light');
	await page.goto('/about');
	expect(await theme(page)).toBe('light');

	await gotoReady(page);
	await page.getByTestId('theme-dark').click();
	expect(await theme(page)).toBe('dark');
	await gotoReady(page);
	expect(await theme(page)).toBe('dark');
});

test('a remembered theme is applied before the first paint', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'light' });
	await page.addInitScript(() => localStorage.setItem('geolang-theme', 'dark'));
	// with scripts from the app bundle blocked, only the inline script in app.html can set it
	await page.route(/\/_app\/.*\.js$/, (route) => route.abort());
	await page.goto('/');
	expect(await theme(page)).toBe('dark');
	expect(await themeColor(page)).toBe('#14171c');
	const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
	expect(bg).toBe('rgb(20, 23, 28)');
});

test('the theme switch sits right of the projection switch', async ({ page }, testInfo) => {
	await gotoReady(page);
	const projection = (await page.getByTestId('projection-toggle').boundingBox())!;
	const toggle = (await page.getByTestId('theme-toggle').boundingBox())!;
	if (page.viewportSize()!.width >= 1260) {
		// in the navbar, in one row
		expect(toggle.x).toBeGreaterThan(projection.x + projection.width - 1);
		expect(Math.abs(toggle.y - projection.y)).toBeLessThanOrEqual(1);
	} else {
		// floating over the map: stacked below the projection switch
		expect(toggle.y).toBeGreaterThan(projection.y + projection.height - 1);
	}
	for (const id of ['theme-light', 'theme-dark']) {
		const box = (await page.getByTestId(id).boundingBox())!;
		expect(box.width).toBeGreaterThanOrEqual(44);
		expect(box.height).toBeGreaterThanOrEqual(isMobile(testInfo.project.name) ? 44 : 38);
	}
	await expect(page.getByTestId('theme-toggle')).toHaveAttribute('role', 'radiogroup');
	await expect(page.getByRole('radio', { name: 'Light' })).toBeVisible();
	await expect(page.getByRole('radio', { name: 'Dark' })).toBeVisible();
});
