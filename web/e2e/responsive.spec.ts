import { test, expect } from '@playwright/test';
import { gotoReady } from './helpers';

test.beforeEach(async ({ page }) => {
	await gotoReady(page);
});

test('no horizontal scroll', async ({ page }) => {
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - window.innerWidth
	);
	expect(overflow).toBeLessThanOrEqual(0);
});

test('search is visible and typeable', async ({ page }) => {
	const input = page.getByTestId('search-input');
	await expect(input).toBeVisible();
	await input.fill('hello');
	await expect(input).toHaveValue('hello');
});

test('map takes at least 70% of the viewport height', async ({ page }) => {
	const vh = page.viewportSize()!.height;
	const box = (await page.getByTestId('map-container').boundingBox())!;
	expect(box.height / vh).toBeGreaterThanOrEqual(0.7);
	expect(box.y + box.height).toBeLessThanOrEqual(vh + 1);
});

test('controls are visible and do not overlap', async ({ page }) => {
	const toggle = (await page.getByTestId('script-toggle').boundingBox())!;
	const controls = (await page.getByTestId('map-controls').boundingBox())!;
	const search = (await page.getByTestId('search-input').boundingBox())!;
	const vp = page.viewportSize()!;
	for (const b of [toggle, controls, search]) {
		expect(b.x).toBeGreaterThanOrEqual(0);
		expect(b.x + b.width).toBeLessThanOrEqual(vp.width + 1);
		expect(b.y + b.height).toBeLessThanOrEqual(vp.height + 1);
	}
	const overlaps = (a: typeof toggle, b: typeof toggle) =>
		a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
	expect(overlaps(toggle, controls)).toBe(false);
	expect(overlaps(toggle, search)).toBe(false);
	expect(overlaps(controls, search)).toBe(false);
});

test('touch targets are at least 44px on touch devices', async ({ page, hasTouch }) => {
	test.skip(!hasTouch, 'touch-target size applies to touch devices');
	const buttons = page.locator(
		'[data-testid="map-controls"] button, [data-testid="script-toggle"] button'
	);
	const n = await buttons.count();
	expect(n).toBeGreaterThan(0);
	for (let i = 0; i < n; i++) {
		const b = (await buttons.nth(i).boundingBox())!;
		expect(b.width).toBeGreaterThanOrEqual(44);
		expect(b.height).toBeGreaterThanOrEqual(44);
	}
	const input = (await page.getByTestId('search-input').boundingBox())!;
	expect(input.height).toBeGreaterThanOrEqual(44);
});

test('layout reflows on rotation', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'ipad', 'rotation checked on tablet');
	const { width, height } = page.viewportSize()!;
	await page.setViewportSize({ width: height, height: width });
	const box = (await page.getByTestId('map-container').boundingBox())!;
	expect(box.width).toBeCloseTo(height, -1);
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - window.innerWidth
	);
	expect(overflow).toBeLessThanOrEqual(0);
	const map = page.getByTestId('world-map');
	await expect.poll(async () => Number(await map.getAttribute('width'))).toBe(height);
});

test('layout snapshot', async ({ page }) => {
	await expect(page).toHaveScreenshot('layout.png');
});
