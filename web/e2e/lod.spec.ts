import { test, expect, type Page } from '@playwright/test';
import { gotoReady, zoomLevel } from './helpers';

// Level-of-detail rendering: simplified outlines at low zoom, clipped outlines when zoomed in,
// rebuilt after a gesture settles, and never leaving blank areas mid-gesture.

const map = (page: Page) => page.getByTestId('world-map');

async function pathChars(page: Page) {
	return map(page).evaluate((svg) =>
		[...svg.querySelectorAll('path.country')].reduce(
			(n, p) => n + (p.getAttribute('d')?.length ?? 0),
			0
		)
	);
}

async function wheelBurst(page: Page, deltaY: number, events: number) {
	await page.evaluate(
		({ deltaY, events }) => {
			const svg = document.querySelector('[data-testid="world-map"]')!;
			const r = svg.getBoundingClientRect();
			for (let i = 0; i < events; i++) {
				svg.dispatchEvent(
					new WheelEvent('wheel', {
						deltaY,
						clientX: r.x + r.width / 2,
						clientY: r.y + r.height / 2,
						bubbles: true,
						cancelable: true
					})
				);
			}
		},
		{ deltaY, events }
	);
}

test.beforeEach(async ({ page }) => {
	await gotoReady(page);
});

test('every country is drawn at world view', async ({ page }) => {
	const empty = await map(page).evaluate((svg) =>
		[...svg.querySelectorAll('path.country')]
			.filter((p) => !p.getAttribute('d'))
			.map((p) => p.getAttribute('data-iso'))
	);
	expect(empty).toEqual([]);
	await expect(map(page)).toHaveAttribute('data-clipped', 'false');
});

test('geometry gets more detailed and clipped after zooming in', async ({ page }) => {
	const lod = Number(await map(page).getAttribute('data-lod'));
	await wheelBurst(page, -100, 30);
	await expect.poll(() => zoomLevel(page)).toBeGreaterThan(8);
	await expect
		.poll(async () => Number(await map(page).getAttribute('data-lod')))
		.toBeGreaterThan(lod);
	await expect(map(page)).toHaveAttribute('data-clipped', 'true');
	// the country in the middle of the screen is drawn
	const hit = await page.evaluate(() => {
		const r = document.querySelector('[data-testid="world-map"]')!.getBoundingClientRect();
		const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
		return el?.getAttribute('class') ?? '';
	});
	expect(hit).toMatch(/country|ocean/);
});

test('zooming out from deep zoom never leaves blank areas', async ({ page }) => {
	await wheelBurst(page, -100, 30);
	await expect(map(page)).toHaveAttribute('data-clipped', 'true');
	const deepChars = await pathChars(page);
	// make the settle delay huge: anything shown now comes from the immediate re-render
	await page.evaluate(
		() => ((window as { __geolangSettleMs?: number }).__geolangSettleMs = 60_000)
	);
	await wheelBurst(page, 100, 30);
	await expect.poll(() => zoomLevel(page)).toBeLessThan(4);
	await expect(map(page)).toHaveAttribute('data-clipped', 'false');
	expect(await pathChars(page)).toBeGreaterThan(deepChars);
	const empty = await map(page).evaluate((svg) =>
		[...svg.querySelectorAll('path.country')]
			.filter((p) => !p.getAttribute('d'))
			.map((p) => p.getAttribute('data-iso'))
	);
	expect(empty).toEqual([]);
});
