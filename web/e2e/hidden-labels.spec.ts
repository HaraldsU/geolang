import { test, expect, type Page } from '@playwright/test';
import {
	canvasColorAt,
	canvasPixel,
	labelPoint,
	cssColor,
	gotoReady,
	search,
	useFixtureData
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
	expect(hit).toMatch(/country|ocean/);
});
