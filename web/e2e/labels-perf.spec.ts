import { test, expect, type Page } from '@playwright/test';
import { gotoReady, labelText, layerTransform, search, useFixtureData, zoomLevel } from './helpers';

// Regression tests for map performance: labels must not be re-rendered on every zoom/pan frame
// (that made zooming laggy) yet must line up with their countries once a gesture settles.

test.beforeEach(async ({ page }) => {
	await useFixtureData(page);
	await gotoReady(page);
	await search(page, 'hello');
	await expect.poll(() => labelText(page, 'DE')).toBe('hallo');
});

/** Zoom has stopped changing and the labels have been re-laid out for it (no gesture transform). */
async function settled(page: Page) {
	let last = '';
	await expect
		.poll(
			async () => {
				const k = await zoomLevel(page);
				const map = await layerTransform(page);
				const layer = await page.getByTestId('label-layer').evaluate((el) => el.style.transform);
				const lk = Number(await page.getByTestId('labels').getAttribute('data-layout-k'));
				const ok = map === last && ['', 'none'].includes(layer) && Math.abs(k - lk) < 0.01;
				last = map;
				return ok;
			},
			{ intervals: [100, 200, 250] }
		)
		.toBe(true);
}

function centre(b: { x: number; y: number; width: number; height: number }) {
	return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

test('label DOM is not touched during a zoom gesture', async ({ page }) => {
	await settled(page);
	// make the settle delay long enough that slow CI browsers can't hit it mid-measurement
	await page.evaluate(() => ((window as { __geolangSettleMs?: number }).__geolangSettleMs = 5000));
	// A burst of wheel events is applied on the next animation frame; checked well within the
	// settle delay, the label elements must be untouched (only the layer's CSS transform moves).
	const mutations = await page.evaluate(
		() =>
			new Promise<number>((resolve) => {
				const labels = document.querySelector('[data-testid="labels"]')!;
				let count = 0;
				const mo = new MutationObserver((records) => (count += records.length));
				mo.observe(labels, {
					attributes: true,
					childList: true,
					subtree: true,
					characterData: true
				});
				const svg = document.querySelector('[data-testid="world-map"]')!;
				const r = svg.getBoundingClientRect();
				for (let i = 0; i < 12; i++) {
					svg.dispatchEvent(
						new WheelEvent('wheel', {
							deltaY: -20,
							clientX: r.x + r.width / 2,
							clientY: r.y + r.height / 2,
							bubbles: true,
							cancelable: true
						})
					);
				}
				requestAnimationFrame(() =>
					setTimeout(() => {
						mo.disconnect();
						resolve(count);
					}, 20)
				);
			})
	);
	expect(mutations).toBe(0);
	const transform = await page.getByTestId('label-layer').evaluate((el) => el.style.transform);
	expect(transform).toContain('scale(');
	await page.evaluate(() => ((window as { __geolangSettleMs?: number }).__geolangSettleMs = 150));
	// one more tiny event so the shorter delay takes effect, then labels must settle
	await page.getByTestId('zoom-in').click();
	await settled(page);
});

test('labels re-layout and line up with their country after zooming', async ({ page }) => {
	const before = await zoomLevel(page);
	await page.getByTestId('zoom-in').click();
	await page.getByTestId('zoom-in').click();
	await expect.poll(() => zoomLevel(page)).toBeGreaterThan(before * 1.5);
	await settled(page);
	await expect(page.getByTestId('label-layer')).not.toHaveClass(/faded/);

	// measure label and country in the same frame
	const m = await page.evaluate(() => {
		const label = document.querySelector('[data-testid="label-DE"]')!;
		const de = document.querySelector('path.country[data-iso="DE"]')!.getBoundingClientRect();
		const visible = label.closest('.label')!.getAttribute('data-visible') === 'true';
		const l = label.getBoundingClientRect();
		return { visible, cx: l.x + l.width / 2, cy: l.y + l.height / 2, de: de.toJSON() };
	});
	if (m.visible) {
		expect(m.cx).toBeGreaterThan(m.de.x);
		expect(m.cx).toBeLessThan(m.de.x + m.de.width);
		expect(m.cy).toBeGreaterThan(m.de.y);
		expect(m.cy).toBeLessThan(m.de.y + m.de.height);
	}
});

test('labels stay attached to countries while panning', async ({ page, isMobile }) => {
	test.skip(isMobile, 'mouse drag');
	const label = page.getByTestId('label-RU');
	await expect(label).toBeVisible();
	const path = page.locator('path.country[data-iso="RU"]');
	const offset = async () => {
		const l = centre((await label.boundingBox())!);
		const p = (await path.boundingBox())!;
		return { dx: l.x - p.x, dy: l.y - p.y };
	};
	const start = await offset();
	const box = (await page.getByTestId('world-map').boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 - 80, box.y + box.height / 2 + 30, { steps: 5 });
	// mid-gesture: label moved together with the map
	const mid = await offset();
	expect(Math.abs(mid.dx - start.dx)).toBeLessThan(2);
	expect(Math.abs(mid.dy - start.dy)).toBeLessThan(2);
	await page.mouse.up();
	await settled(page);
});

test('labels of long, even countries are centred (Latvia)', async ({ page }) => {
	// zoom in on Latvia until its label fits
	const lv = page.locator('path.country[data-iso="LV"]');
	const b = (await lv.boundingBox())!;
	await page.evaluate(({ x, y }) => {
		const svg = document.querySelector('[data-testid="world-map"]')!;
		for (let i = 0; i < 25; i++) {
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
	}, centre(b));
	await settled(page);
	await expect(page.locator('[data-testid="labels"] .label[data-iso="LV"]')).toHaveAttribute(
		'data-visible',
		'true'
	);
	// the word's anchor (its centre) lies in the middle third of Latvia, west to east
	const m = await page.evaluate(() => {
		const g = document.querySelector('[data-testid="labels"] .label[data-iso="LV"]')!;
		const [, ax] = g.getAttribute('transform')!.match(/translate\(([-\d.]+),/)!;
		const svg = g.ownerSVGElement!.getBoundingClientRect();
		const lv = document.querySelector('path.country[data-iso="LV"]')!.getBoundingClientRect();
		return { x: svg.x + Number(ax), lv: lv.toJSON() };
	});
	const rel = (m.x - m.lv.x) / m.lv.width;
	expect(rel).toBeGreaterThan(1 / 3);
	expect(rel).toBeLessThan(2 / 3);
});
