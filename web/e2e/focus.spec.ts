import { test, expect, type Page } from '@playwright/test';
import { gotoReady, mapSettled, selectCountry, zoomLevel } from './helpers';
import { freeArea as uncovered } from '../src/lib/map/focus';

type Box = { x: number; y: number; width: number; height: number };

/** The largest map area not covered by the country panel (beside, above or below it). */
async function freeArea(page: Page): Promise<Box> {
	const map = (await page.getByTestId('map-container').boundingBox())!;
	const panel = (await page.getByTestId('country-panel').boundingBox())!;
	return uncovered(map, panel);
}

/** Wait for the map to settle, then the country's on-screen box. */
async function settledBox(page: Page, iso: string) {
	await mapSettled(page);
	return (await page.locator(`path.country[data-iso="${iso}"]`).boundingBox())!;
}

const centre = (b: Box) => [b.x + b.width / 2, b.y + b.height / 2];

test('clicking a small country zooms in and centres it beside the panel', async ({ page }) => {
	await gotoReady(page);
	const before = await zoomLevel(page);
	await selectCountry(page, 'CH');
	const box = await settledBox(page, 'CH');
	expect(await zoomLevel(page)).toBeGreaterThan(before * 4);
	const free = await freeArea(page);
	const [cx, cy] = centre(box);
	const [fx, fy] = centre(free);
	expect(Math.abs(cx - fx)).toBeLessThan(free.width * 0.05);
	expect(Math.abs(cy - fy)).toBeLessThan(free.height * 0.05);
	// a good size: fills about half the free area, and fits
	expect(Math.max(box.width / free.width, box.height / free.height)).toBeGreaterThan(0.3);
	expect(box.width).toBeLessThan(free.width);
	expect(box.height).toBeLessThan(free.height);
});

test('clicking a neighbour of a similar size only pans', async ({ page }) => {
	await gotoReady(page);
	await selectCountry(page, 'FR');
	await settledBox(page, 'FR');
	const zoom = await zoomLevel(page);
	await selectCountry(page, 'DE');
	const box = await settledBox(page, 'DE');
	expect(await zoomLevel(page)).toBe(zoom);
	const free = await freeArea(page);
	const [cx, cy] = centre(box);
	const [fx, fy] = centre(free);
	expect(Math.abs(cx - fx)).toBeLessThan(free.width * 0.05);
	expect(Math.abs(cy - fy)).toBeLessThan(free.height * 0.05);
});

test('clicking the selected country again deselects it without moving the map', async ({
	page
}) => {
	await gotoReady(page);
	await selectCountry(page, 'CH');
	await settledBox(page, 'CH');
	const zoom = await zoomLevel(page);
	await page
		.locator('path.country[data-iso="CH"]')
		.evaluate((el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
	await expect(page.getByTestId('country-panel')).toHaveCount(0);
	await settledBox(page, 'CH');
	expect(await zoomLevel(page)).toBe(zoom);
});

test('two quick clicks settle on the second country', async ({ page }) => {
	await gotoReady(page);
	await page.evaluate(() => {
		for (const iso of ['FR', 'JP'])
			document
				.querySelector(`path.country[data-iso="${iso}"]`)!
				.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	});
	await expect(page.getByTestId('country-panel')).toHaveAttribute('data-iso', 'JP');
	const box = await settledBox(page, 'JP');
	const free = await freeArea(page);
	const [cx, cy] = centre(box);
	const [fx, fy] = centre(free);
	expect(Math.abs(cx - fx)).toBeLessThan(free.width * 0.05);
	expect(Math.abs(cy - fy)).toBeLessThan(free.height * 0.05);
});
