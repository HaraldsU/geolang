import { expect, type Page } from '@playwright/test';

export async function gotoReady(page: Page, path = '/') {
	await page.goto(path);
	await expect(page.getByTestId('world-map')).toHaveAttribute('data-ready', 'true');
}

/** Wait until the map has stopped zooming or panning (e.g. after clicking a country). */
export async function mapSettled(page: Page) {
	await expect(page.getByTestId('world-map')).toHaveAttribute('data-moving', 'false');
}

export async function zoomLevel(page: Page) {
	return Number(await page.getByTestId('world-map').getAttribute('data-zoom'));
}

export async function layerTransform(page: Page) {
	return (await page.getByTestId('zoom-layer').getAttribute('transform')) ?? '';
}

export function isMobile(projectName: string) {
	return ['pixel-7', 'iphone-14'].includes(projectName);
}

const FIXTURE_DIR = new URL('./fixtures/data/', import.meta.url);

/** Serve the small pipeline-built fixture dataset instead of the real translation data. */
export async function useFixtureData(page: Page) {
	const { readFile } = await import('node:fs/promises');
	await page.route(/\/data\/(manifest\.json|vfixture\/.*)$/, async (route) => {
		const rel = new URL(route.request().url()).pathname.replace(/^\/data\//, '');
		try {
			const body = await readFile(new URL(rel, FIXTURE_DIR));
			const contentType = rel.endsWith('.woff2') ? 'font/woff2' : 'application/json';
			await route.fulfill({ body, contentType });
		} catch {
			await route.fulfill({ status: 404, body: 'not found' });
		}
	});
}

export async function search(page: Page, word: string) {
	const input = page.getByTestId('search-input');
	await input.fill(word);
	await input.press('Enter');
}

export async function labelText(page: Page, iso: string) {
	return page.getByTestId(`label-${iso}`).textContent();
}

/** Select a country without needing a precise pointer hit (works for tiny countries too). */
export async function selectCountry(page: Page, iso: string) {
	await page
		.locator(`path.country[data-iso="${iso}"]`)
		.evaluate((el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
	await expect(page.getByTestId('country-panel')).toHaveAttribute('data-iso', iso);
}

/** CSS hex colour (#rrggbb) of a custom property on the map. */
export async function cssColor(page: Page, name: string) {
	return page
		.getByTestId('map-container')
		.evaluate((el, name) => getComputedStyle(el).getPropertyValue(name).trim(), name);
}

/**
 * Colour painted on the map canvas at the centre of a country's (invisible) hit-test path's
 * bounding box, as #rrggbb. Pick countries whose box centre lies inside them.
 */
export async function canvasColorAt(page: Page, iso: string) {
	return page.evaluate((iso) => {
		const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="map-canvas"]')!;
		const p = document.querySelector(`path.country[data-iso="${iso}"]`)!.getBoundingClientRect();
		const c = canvas.getBoundingClientRect();
		const sx = canvas.width / c.width;
		const sy = canvas.height / c.height;
		const x = Math.round((p.x + p.width / 2 - c.x) * sx);
		const y = Math.round((p.y + p.height / 2 - c.y) * sy);
		const [r, g, b] = canvas.getContext('2d')!.getImageData(x, y, 1, 1).data;
		return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
	}, iso);
}

/** Colour (#rrggbb) of one canvas pixel, in canvas (device) pixels. */
export async function canvasPixel(page: Page, [x, y]: [number, number]) {
	return page.getByTestId('map-canvas').evaluate(
		(canvas, [x, y]) => {
			const [r, g, b] = (canvas as HTMLCanvasElement)
				.getContext('2d')!
				.getImageData(x, y, 1, 1).data;
			return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
		},
		[x, y]
	);
}

/**
 * Canvas pixel at a country's label anchor (always inside the country, unlike a bounding-box
 * centre). Requires the label to exist, i.e. a search has been made.
 */
export async function labelPoint(page: Page, iso: string): Promise<[number, number]> {
	return page.evaluate((iso) => {
		const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="map-canvas"]')!;
		const g = document.querySelector(`[data-testid="labels"] .label[data-iso="${iso}"]`)!;
		const [, ax, ay] = g.getAttribute('transform')!.match(/translate\(([-\d.]+),([-\d.]+)\)/)!;
		const c = canvas.getBoundingClientRect();
		const svg = g.ownerSVGElement!.getBoundingClientRect();
		return [
			Math.round((svg.x + Number(ax) - c.x) * (canvas.width / c.width)),
			Math.round((svg.y + Number(ay) - c.y) * (canvas.height / c.height))
		] as [number, number];
	}, iso);
}

/** On phones the toggles sit behind the settings button: open it (no-op elsewhere). */
export async function showToggles(page: Page) {
	const button = page.getByTestId('settings-button');
	if ((await button.isVisible()) && (await button.getAttribute('aria-expanded')) !== 'true') {
		await button.click();
	}
	await expect(page.getByTestId('script-toggle')).toBeVisible();
}
