import { test, expect, type Page } from '@playwright/test';
import { gotoReady, labelText, search, useFixtureData, zoomLevel } from './helpers';

const map = (page: Page) => page.getByTestId('world-map');

async function box(page: Page, iso: string) {
	return (await page.locator(`path.country[data-iso="${iso}"]`).boundingBox())!;
}

/** Greenland's on-screen area relative to Australia's (really about 0.28). */
async function greenlandVsAustralia(page: Page) {
	const [gl, au] = [await box(page, 'GL'), await box(page, 'AU')];
	return (gl.width * gl.height) / (au.width * au.height);
}

test.beforeEach(async ({ page }) => {
	await useFixtureData(page);
});

test('Mercator is the default; the toggle switches to Equal Earth and back', async ({ page }) => {
	await gotoReady(page);
	await expect(map(page)).toHaveAttribute('data-projection', 'mercator');
	await expect(page.getByTestId('projection-mercator')).toHaveAttribute('aria-checked', 'true');
	expect(await greenlandVsAustralia(page)).toBeGreaterThan(1); // Mercator inflates the poles

	await page.getByTestId('projection-equal-earth').click();
	await expect(map(page)).toHaveAttribute('data-projection', 'equal-earth');
	await expect(page.getByTestId('projection-equal-earth')).toHaveAttribute('aria-checked', 'true');
	await expect.poll(() => greenlandVsAustralia(page)).toBeLessThan(0.6); // equal-area
	await expect(page).toHaveURL(/[?&]proj=equal-earth/);

	await page.getByTestId('projection-mercator').click();
	await expect(map(page)).toHaveAttribute('data-projection', 'mercator');
	await expect(page).not.toHaveURL(/proj=/); // the default is left out of the URL
});

test('the projection toggle comes after the writing-system toggle', async ({ page }) => {
	await gotoReady(page);
	const order = await page
		.locator('[data-testid="script-toggle"], [data-testid="projection-toggle"]')
		.evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
	expect(order).toEqual(['script-toggle', 'projection-toggle']);
});

test('switching projection resets the view and keeps the labels on their countries', async ({
	page
}) => {
	// The default zoom depends on the projection (on portrait screens): read Equal Earth's first.
	await gotoReady(page, '/?proj=equal-earth');
	const equalEarthDefault = await zoomLevel(page);

	await gotoReady(page);
	const mercatorDefault = await zoomLevel(page);
	await page.getByTestId('zoom-in').click();
	await expect.poll(() => zoomLevel(page)).toBeGreaterThan(mercatorDefault * 1.2);

	await search(page, 'hello');
	await expect.poll(() => labelText(page, 'FR')).toBe('bonjour');
	await page.getByTestId('projection-equal-earth').click();
	await expect.poll(() => zoomLevel(page)).toBeCloseTo(equalEarthDefault, 2);

	// every label shown is re-anchored inside its own country
	await expect(async () => {
		const misplaced = await page.evaluate(() => {
			const out: string[] = [];
			const labels = document.querySelectorAll('g.label[data-visible="true"]');
			for (const g of labels) {
				const iso = g.getAttribute('data-iso');
				const country = document.querySelector(`path.country[data-iso="${iso}"]`);
				const l = g.querySelector('text.word')!.getBoundingClientRect();
				const c = country!.getBoundingClientRect();
				const [x, y] = [l.x + l.width / 2, l.y + l.height / 2];
				if (x < c.left || x > c.right || y < c.top || y > c.bottom) out.push(iso!);
			}
			return { n: labels.length, out };
		});
		expect(misplaced.n).toBeGreaterThan(3);
		expect(misplaced.out).toEqual([]);
	}).toPass();
});

test('the projection survives a reload and ignores unknown values', async ({ page }) => {
	await gotoReady(page, '/?q=hello&proj=equal-earth');
	await expect(map(page)).toHaveAttribute('data-projection', 'equal-earth');
	await expect.poll(() => labelText(page, 'FR')).toBe('bonjour');
	await gotoReady(page, '/?proj=nonsense');
	await expect(map(page)).toHaveAttribute('data-projection', 'mercator');
});
