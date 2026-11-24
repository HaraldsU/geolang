import { test, expect, type Page } from '@playwright/test';
import {
	canvasColorAt,
	cssColor,
	gotoReady,
	layerTransform,
	mapSettled,
	selectCountry,
	zoomLevel
} from './helpers';

// Panning copies a cached bitmap of the map instead of redrawing every country outline each
// frame (which made panning laggy when zoomed out): see src/lib/map/raster.ts.

const canvas = (page: Page) => page.getByTestId('map-canvas');
const renders = async (page: Page) => Number(await canvas(page).getAttribute('data-renders'));

/** Wait until the map is still and the idle cache refresh has run (renders stop changing). */
async function idle(page: Page) {
	await mapSettled(page);
	let last = -1;
	await expect
		.poll(
			async () => {
				const n = await renders(page);
				const same = n === last;
				last = n;
				return same;
			},
			{ intervals: [400, 400, 400] }
		)
		.toBe(true);
}

async function zoomTo(page: Page, k: number) {
	await page.evaluate(
		(events) => {
			const svg = document.querySelector('[data-testid="world-map"]')!;
			const r = svg.getBoundingClientRect();
			for (let i = 0; i < events; i++) {
				svg.dispatchEvent(
					new WheelEvent('wheel', {
						deltaY: -100,
						clientX: r.x + r.width / 2,
						clientY: r.y + r.height / 2,
						bubbles: true,
						cancelable: true
					})
				);
			}
		},
		Math.round(Math.log(k) / Math.log(2 ** 0.2))
	);
	await expect.poll(() => zoomLevel(page)).toBeGreaterThan(k * 0.8);
}

/** Drag the map with the mouse by (dx, dy) in `steps` moves, starting from its centre. */
async function drag(page: Page, dx: number, dy: number, steps = 10) {
	const box = (await page.getByTestId('world-map').boundingBox())!;
	const x = box.x + box.width / 2;
	const y = box.y + box.height / 2;
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x + dx, y + dy, { steps });
	await page.mouse.up();
}

/** Keep a copy of the canvas in the page, to compare later frames with. */
function remember(page: Page) {
	return canvas(page).evaluate((c) => {
		const el = c as HTMLCanvasElement;
		(window as { __frame?: Uint8ClampedArray }).__frame = el
			.getContext('2d')!
			.getImageData(0, 0, el.width, el.height).data;
	});
}

/**
 * Compare the canvas with the remembered frame shifted by up to 2 device pixels each way:
 * share of pixels that differ (beyond rounding) at each shift, keyed "dx,dy". Browsers may
 * anti-alias an offscreen canvas slightly differently, so a misplaced copy shows up as a
 * better match at a non-zero shift rather than as any difference at all.
 */
function shiftedDifferences(page: Page) {
	return canvas(page).evaluate((c) => {
		const el = c as HTMLCanvasElement;
		const { width: w, height: h } = el;
		const now = el.getContext('2d')!.getImageData(0, 0, w, h).data;
		const then = (window as { __frame?: Uint8ClampedArray }).__frame!;
		const out: Record<string, number> = {};
		for (let dy = -2; dy <= 2; dy++) {
			for (let dx = -2; dx <= 2; dx++) {
				let n = 0;
				let total = 0;
				for (let y = 2; y < h - 2; y += 2) {
					for (let x = 2; x < w - 2; x += 2) {
						const i = (y * w + x) * 4;
						const j = ((y + dy) * w + x + dx) * 4;
						const d =
							Math.abs(now[i] - then[j]) +
							Math.abs(now[i + 1] - then[j + 1]) +
							Math.abs(now[i + 2] - then[j + 2]);
						if (d > 6) n++;
						total++;
					}
				}
				out[`${dx},${dy}`] = n / total;
			}
		}
		return out;
	});
}

test.beforeEach(async ({ page }) => {
	await gotoReady(page);
});

for (const k of [1, 2.5]) {
	test(`panning at zoom ${k} does not redraw the countries`, async ({ page }) => {
		if (k > 1) await zoomTo(page, k);
		await idle(page);
		const before = await renders(page);
		await drag(page, 60, 30);
		await drag(page, -90, -20);
		await expect(canvas(page)).toHaveAttribute('data-cache', 'hit');
		expect(await renders(page)).toBe(before);
	});
}

test('a panned frame is identical to a freshly drawn one', async ({ page }) => {
	// no geometry rebuild and no idle cache refresh during the test
	await page.evaluate(
		() => ((window as { __geolangSettleMs?: number }).__geolangSettleMs = 60_000)
	);
	await zoomTo(page, 2);
	await mapSettled(page);
	// the last frame of the zoom was drawn from scratch
	await expect(canvas(page)).toHaveAttribute('data-cache', 'miss');
	await remember(page);
	const start = await layerTransform(page);
	// away and back: the frame is now a copy of the cache, at the same position
	await drag(page, 40, 25, 5);
	await drag(page, -40, -25, 5);
	await mapSettled(page);
	// not stopped at the edge of the map: back where it started
	const numbers = (t: string) => t.match(/-?[\d.]+/g)!.map(Number);
	const end = numbers(await layerTransform(page));
	numbers(start).forEach((v, i) => expect(end[i]).toBeCloseTo(v, 2));
	await expect(canvas(page)).toHaveAttribute('data-cache', 'hit');
	const diff = await shiftedDifferences(page);
	const best = Object.entries(diff).sort((a, b) => a[1] - b[1])[0];
	expect(best[0]).toBe('0,0');
	expect(diff['0,0']).toBeLessThan(0.02);
});

test('a selected country stays selected while the map is panned', async ({ page }) => {
	await selectCountry(page, 'LY');
	await mapSettled(page);
	const selectedColor = await cssColor(page, '--land-selected');
	await expect.poll(() => canvasColorAt(page, 'LY')).toBe(selectedColor);
	await drag(page, 50, 20);
	await expect(canvas(page)).toHaveAttribute('data-cache', 'hit');
	await expect.poll(() => canvasColorAt(page, 'LY')).toBe(selectedColor);
});

test('panning far beyond the cached area redraws it, with no gaps', async ({ page }) => {
	await zoomTo(page, 6);
	await idle(page);
	const before = await renders(page);
	const box = (await page.getByTestId('world-map').boundingBox())!;
	for (let i = 0; i < 3; i++) await drag(page, -box.width * 0.4, 0);
	await mapSettled(page);
	expect(await renders(page)).toBeGreaterThan(before);
	// every corner is painted (opaque), so the whole canvas was covered
	const alpha = await canvas(page).evaluate((c) => {
		const el = c as HTMLCanvasElement;
		const ctx = el.getContext('2d')!;
		return [
			[1, 1],
			[el.width - 2, 1],
			[1, el.height - 2],
			[el.width - 2, el.height - 2]
		].map(([x, y]) => ctx.getImageData(x, y, 1, 1).data[3]);
	});
	expect(alpha).toEqual([255, 255, 255, 255]);
});

test('dragging the map does not hover the countries it passes', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop-chrome', 'hover needs a mouse');
	const tooltip = page.getByTestId('country-tooltip');
	const ly = (await page.locator('path.country[data-iso="LY"]').boundingBox())!;
	const x = ly.x + ly.width / 2;
	const y = ly.y + ly.height / 2;
	await page.mouse.move(x, y);
	await expect(tooltip).toHaveAttribute('data-iso', 'LY');
	await page.mouse.down();
	await page.mouse.move(x + 200, y + 40, { steps: 8 });
	await expect(tooltip).toHaveCount(0);
	await page.mouse.move(x + 230, y + 40, { steps: 3 });
	await expect(tooltip).toHaveCount(0);
	await page.mouse.up();
	// once the drag is over, hovering works again
	await mapSettled(page);
	await page.mouse.move(x + 231, y + 41);
	await expect(tooltip).toHaveAttribute('data-iso', 'LY');
});
