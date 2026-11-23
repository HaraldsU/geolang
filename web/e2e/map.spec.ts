import { test, expect } from '@playwright/test';
import { canvasColorAt, cssColor, gotoReady, layerTransform, zoomLevel } from './helpers';

test.beforeEach(async ({ page }) => {
	await gotoReady(page);
});

test('renders all countries with ISO ids', async ({ page }) => {
	const paths = page.locator('path.country');
	expect(await paths.count()).toBeGreaterThanOrEqual(170);
	for (const iso of ['FR', 'RU', 'US', 'BR', 'IN', 'CN', 'ZA', 'AU']) {
		await expect(page.locator(`path.country[data-iso="${iso}"]`)).toHaveCount(1);
	}
	const ids = await paths.evaluateAll((els) => els.map((e) => e.getAttribute('data-iso')));
	expect(ids.every((id) => id && /^[A-Z]{2}$/.test(id))).toBe(true);
});

test('zoom buttons change the zoom level', async ({ page }) => {
	const initial = await zoomLevel(page);
	expect(initial).toBeGreaterThanOrEqual(1);
	await page.getByTestId('zoom-in').click();
	await expect.poll(() => zoomLevel(page)).toBeGreaterThan(initial * 1.5);
	await page.getByTestId('zoom-out').click();
	await expect.poll(() => zoomLevel(page)).toBeCloseTo(initial, 1);
	await page.getByTestId('zoom-in').click();
	await page.getByTestId('zoom-reset').click();
	await expect.poll(() => zoomLevel(page)).toBeCloseTo(initial, 2);
});

test('portrait screens start zoomed so the map fills the height', async ({ page }) => {
	const vp = page.viewportSize()!;
	test.skip(vp.height <= vp.width, 'landscape viewport');
	const land = (await page.locator('g.countries').boundingBox())!;
	const map = (await page.getByTestId('map-container').boundingBox())!;
	expect(land.height / map.height).toBeGreaterThan(0.6);
});

test('mouse wheel zooms and dragging pans', async ({ page, isMobile }) => {
	test.skip(isMobile, 'wheel/mouse drag are desktop interactions');
	const box = (await page.getByTestId('world-map').boundingBox())!;
	const cx = box.x + box.width / 2;
	const cy = box.y + box.height / 2;
	await page.mouse.move(cx, cy);
	const initial = await zoomLevel(page);
	await page.mouse.wheel(0, -600);
	await expect.poll(() => zoomLevel(page)).toBeGreaterThan(initial * 1.2);

	const before = await layerTransform(page);
	await page.mouse.move(cx, cy);
	await page.mouse.down();
	await page.mouse.move(cx + 120, cy + 60, { steps: 8 });
	await page.mouse.up();
	await expect.poll(() => layerTransform(page)).not.toBe(before);
});

test('hovering highlights a country', async ({ page, isMobile }) => {
	test.skip(isMobile, 'hover is a pointer-device interaction');
	await expect.poll(() => canvasColorAt(page, 'BR')).toBe(await cssColor(page, '--land'));
	await page.locator('path.country[data-iso="BR"]').hover();
	await expect.poll(() => canvasColorAt(page, 'BR')).toBe(await cssColor(page, '--land-hover'));
	await page.mouse.move(2, 2);
	await expect.poll(() => canvasColorAt(page, 'BR')).toBe(await cssColor(page, '--land'));
});

test('clicking/tapping a country selects it, again deselects', async ({ page }) => {
	// Libya is near the centre of the default view on every screen size.
	const libya = page.locator('path.country[data-iso="LY"]');
	await libya.click();
	await expect(libya).toHaveClass(/selected/);
	await libya.click();
	await expect(libya).not.toHaveClass(/selected/);
});

test('clicking the ocean clears the selection', async ({ page }) => {
	const libya = page.locator('path.country[data-iso="LY"]');
	await libya.click();
	await expect(libya).toHaveClass(/selected/);
	// find open sea (depends on the projection and layout): a point where the ocean is on top
	const sea = await page.locator('rect.ocean').evaluate((ocean) => {
		const r = ocean.getBoundingClientRect();
		for (let y = r.top + r.height * 0.3; y < r.bottom - 10; y += 10) {
			for (let x = r.left + 10; x < r.right - 10; x += 10) {
				if (document.elementFromPoint(x, y) === ocean) return { x: x - r.left, y: y - r.top };
			}
		}
		return null;
	});
	expect(sea).not.toBeNull();
	await page.locator('rect.ocean').click({ position: sea! });
	await expect(page.locator('path.country.selected')).toHaveCount(0);
});

test('fullscreen button enters and exits fullscreen', async ({ page, browserName, isMobile }) => {
	test.skip(
		browserName !== 'chromium' || isMobile,
		'Fullscreen API is verified on desktop Chromium'
	);
	await page.getByTestId('fullscreen').click();
	await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
	await page.getByTestId('fullscreen').click();
	await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
});

test('default map snapshot', async ({ page }) => {
	await expect(page.getByTestId('map-container')).toHaveScreenshot('default-map.png');
});
