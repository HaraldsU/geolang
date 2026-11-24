import { test, expect, type Page } from '@playwright/test';
import { gotoReady, mapSettled, search, selectCountry, zoomLevel } from './helpers';

/** Wheel-zoom in on a country until its word is shown or the map stops zooming in. */
async function zoomInOn(page: Page, iso: string) {
	const label = page.locator(`g.label[data-iso="${iso}"]`);
	for (let last = 0; ;) {
		await mapSettled(page);
		await expect(page.getByTestId('labels')).toHaveAttribute(
			'data-layout-k',
			(await zoomLevel(page)).toFixed(3)
		);
		const k = await zoomLevel(page);
		if ((await label.getAttribute('data-visible')) === 'true' || k <= last * 1.01) return k;
		last = k;
		const box = (await page.locator(`path.country[data-iso="${iso}"]`).boundingBox())!;
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.wheel(0, -400);
	}
}

// Small countries need deep zoom before their word fits, on small screens too.
for (const iso of ['CY', 'MT', 'VA']) {
	test(`the word for ${iso} can be shown by zooming in`, async ({ page }) => {
		await gotoReady(page);
		await search(page, 'water');
		await expect(page.locator(`g.label[data-iso="${iso}"]`)).toHaveCount(1);
		await selectCountry(page, iso);
		await zoomInOn(page, iso);
		await expect(page.locator(`g.label[data-iso="${iso}"]`)).toHaveAttribute(
			'data-visible',
			'true'
		);
	});
}
