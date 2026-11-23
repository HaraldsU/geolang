import { test, expect } from '@playwright/test';
import { canvasColorAt, cssColor, gotoReady, zoomLevel } from './helpers';

// Countries are painted on a canvas (redrawn every frame, so never shown blurry/stretched);
// invisible SVG paths on top handle pointer input.

test.beforeEach(async ({ page }) => {
	await gotoReady(page);
});

test('canvas is sized for the device pixel ratio', async ({ page }) => {
	const { w, h, cw, ch, dpr } = await page.getByTestId('map-canvas').evaluate((c) => {
		const canvas = c as HTMLCanvasElement;
		const r = canvas.getBoundingClientRect();
		return {
			w: canvas.width,
			h: canvas.height,
			cw: r.width,
			ch: r.height,
			dpr: devicePixelRatio
		};
	});
	expect(Math.abs(w - cw * dpr)).toBeLessThanOrEqual(1);
	expect(Math.abs(h - ch * dpr)).toBeLessThanOrEqual(1);
});

test('land and ocean are painted in the theme colours', async ({ page }) => {
	await expect.poll(() => canvasColorAt(page, 'LY')).toBe(await cssColor(page, '--land'));
	const ocean = await cssColor(page, '--ocean');
	const corner = await page.getByTestId('map-canvas').evaluate((c) => {
		const [r, g, b] = (c as HTMLCanvasElement).getContext('2d')!.getImageData(2, 2, 1, 1).data;
		return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
	});
	expect(corner).toBe(ocean);
});

test('dark colour scheme repaints the map', async ({ page }) => {
	const light = await canvasColorAt(page, 'LY');
	await page.emulateMedia({ colorScheme: 'dark' });
	await expect.poll(() => canvasColorAt(page, 'LY')).not.toBe(light);
	await expect.poll(() => canvasColorAt(page, 'LY')).toBe(await cssColor(page, '--land'));
});

test('selection is painted on the canvas', async ({ page }) => {
	await page.locator('path.country[data-iso="LY"]').click();
	await expect.poll(() => canvasColorAt(page, 'LY')).toBe(await cssColor(page, '--land-selected'));
});

test('the map is repainted at the new zoom immediately, not after it settles', async ({ page }) => {
	// never let the geometry rebuild: whatever is shown comes from the per-frame redraw
	await page.evaluate(
		() => ((window as { __geolangSettleMs?: number }).__geolangSettleMs = 60_000)
	);
	await page.getByTestId('zoom-in').click();
	await expect.poll(() => zoomLevel(page)).toBeGreaterThan(1.5);
	// once the zoom animation has finished, the last painted frame is at the final zoom
	await expect(async () => {
		const [painted, zoom] = await page.evaluate(() => [
			document.querySelector('[data-testid="map-canvas"]')!.getAttribute('data-k'),
			document.querySelector('[data-testid="world-map"]')!.getAttribute('data-zoom')
		]);
		expect(painted).toBe(zoom);
		expect(Number(zoom)).toBeGreaterThan(1.5);
	}).toPass();
	await expect.poll(() => canvasColorAt(page, 'LY')).toBe(await cssColor(page, '--land'));
});
