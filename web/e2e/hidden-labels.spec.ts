import { test, expect, type Page } from '@playwright/test';
import {
	canvasColorAt,
	canvasPixel,
	labelPoint,
	cssColor,
	gotoReady,
	mapSettled,
	search,
	useFixtureData,
	zoomLevel
} from './helpers';

// Countries whose label doesn't fit at the current zoom get a dot instead, and countries that
// have the word are tinted, so small countries never look untranslated.

const labels = (page: Page) => page.getByTestId('labels');

/** ISO code and screen position of the first dot matching `selector`. */
async function firstDot(page: Page, selector: string) {
	const dot = labels(page).locator(selector).first();
	await expect(dot).toBeAttached();
	const iso = (await dot.getAttribute('data-iso'))!;
	const box = (await dot.boundingBox())!;
	return { iso, x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function zoomAt(page: Page, x: number, y: number, events: number) {
	await page.evaluate(
		({ x, y, events }) => {
			const svg = document.querySelector('[data-testid="world-map"]')!;
			for (let i = 0; i < events; i++) {
				svg.dispatchEvent(
					new WheelEvent('wheel', {
						deltaY: -100,
						clientX: x,
						clientY: y,
						bubbles: true,
						cancelable: true
					})
				);
			}
		},
		{ x, y, events }
	);
}

test.beforeEach(async ({ page }) => {
	await useFixtureData(page);
	await gotoReady(page);
});

test('no dots and no tint before searching', async ({ page }) => {
	await expect(labels(page).locator('.dot')).toHaveCount(0);
	await expect.poll(() => canvasColorAt(page, 'LY')).toBe(await cssColor(page, '--land'));
});

test('a small country gets a dot that turns into its label when zoomed in', async ({ page }) => {
	await search(page, 'hello');
	await expect(labels(page).locator('.dot').first()).toBeAttached();
	// first small European country that is shown as a dot on this screen size
	let iso = '';
	for (const c of ['CH', 'BE', 'NL', 'AT', 'DK', 'LU', 'PT', 'CZ', 'HU']) {
		if (await page.getByTestId(`dot-${c}`).count()) {
			iso = c;
			break;
		}
	}
	expect(iso, 'some small European country has a dot').not.toBe('');
	const label = labels(page).locator(`.label[data-iso="${iso}"]`);
	await expect(label).toHaveAttribute('data-visible', 'false');
	const box = (await page.getByTestId(`dot-${iso}`).boundingBox())!;
	// zoom in on the dot (the point under the cursor stays put)
	await zoomAt(page, box.x + box.width / 2, box.y + box.height / 2, 20);
	await expect(label).toHaveAttribute('data-visible', 'true');
	await expect(page.getByTestId(`dot-${iso}`)).toHaveCount(0);
});

test('hidden N/A countries get a hollow marker', async ({ page }) => {
	await search(page, 'testword');
	await expect.poll(() => labels(page).locator('.dot.na').count()).toBeGreaterThan(0);
	const { iso } = await firstDot(page, '.dot.na');
	await expect(labels(page).locator(`.label[data-iso="${iso}"]`)).toHaveClass(/na/);
});

test('countries with the word are tinted, N/A countries are not', async ({ page }) => {
	const land = await cssColor(page, '--land');
	const word = await cssColor(page, '--land-word');
	await search(page, 'testword');
	await expect(page.getByTestId('status')).toHaveAttribute('data-status', 'done');
	const fr = await labelPoint(page, 'FR');
	await expect.poll(() => canvasPixel(page, fr)).toBe(word);
	const na = (await labels(page)
		.locator('.label.na[data-visible="true"]')
		.first()
		.getAttribute('data-iso'))!;
	await expect.poll(async () => canvasPixel(page, await labelPoint(page, na))).toBe(land);
	// a word with no results clears the tint
	await search(page, 'qqqzzzunknown');
	await expect(page.getByTestId('status')).toHaveAttribute('data-status', 'empty');
	await expect.poll(() => canvasPixel(page, fr)).toBe(land);
});

test('dots do not catch pointer input meant for the map', async ({ page }) => {
	await search(page, 'hello');
	const { x, y } = await firstDot(page, '.dot');
	const hit = await page.evaluate(
		([x, y]) => document.elementFromPoint(x, y)?.getAttribute('class') ?? '',
		[x, y]
	);
	// the map's own hit layer gets it (a country, the sea, or a dot standing in for a country)
	expect(hit).toMatch(/country|ocean|hit-dot/);
});

/** Malta's dot: at the default zoom it is larger than Malta itself, on every screen size. */
async function maltaDot(page: Page) {
	await search(page, 'water');
	const dot = page.getByTestId('dot-MT');
	await expect(dot).toBeAttached();
	const hit = page.getByTestId('hit-dot-MT');
	await expect(hit).toBeAttached();
	const d = (await dot.boundingBox())!;
	const h = (await hit.boundingBox())!;
	const malta = (await page.locator('path.country[data-iso="MT"]').boundingBox())!;
	// the target is exactly the dot (with its halo), which is larger than Malta's outline
	for (const k of ['x', 'y', 'width', 'height'] as const)
		expect(Math.abs(h[k] - d[k])).toBeLessThan(0.5);
	expect(malta.width * malta.height).toBeLessThan(d.width * d.height);
	return { x: d.x + d.width / 2, y: d.y + d.height / 2 };
}

test('a dot larger than its country selects the country, centred and zoomed in', async ({
	page
}) => {
	const { x, y } = await maltaDot(page);
	const before = Number(await page.getByTestId('world-map').getAttribute('data-zoom'));
	// a dot's edge, away from Malta's own outline, still counts as Malta
	await page.mouse.click(x + 2.5, y);
	await expect(page.getByTestId('country-panel')).toHaveAttribute('data-iso', 'MT');
	await mapSettled(page);
	expect(await zoomLevel(page)).toBeGreaterThan(before * 4);
	// zoomed in, Malta is large enough to click itself: no stand-in dot any more
	await expect(page.getByTestId('hit-dot-MT')).toHaveCount(0);
	// clicking it again deselects, as with any country
	const malta = (await page.locator('path.country[data-iso="MT"]').boundingBox())!;
	await page.mouse.click(malta.x + malta.width / 2, malta.y + malta.height / 2);
	await expect(page.getByTestId('country-panel')).toHaveCount(0);
});

test('hovering a dot shows its country', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop-chrome', 'hover needs a mouse');
	const { x, y } = await maltaDot(page);
	await page.mouse.move(x, y);
	await expect(page.getByTestId('country-tooltip')).toHaveAttribute('data-iso', 'MT');
});

test('zooming with the pointer on a dot still zooms the map', async ({ page }) => {
	const { x, y } = await maltaDot(page);
	const before = await zoomLevel(page);
	await zoomAt(page, x, y, 3);
	await expect.poll(() => zoomLevel(page)).toBeGreaterThan(before * 1.2);
});
