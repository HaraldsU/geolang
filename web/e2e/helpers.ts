import { expect, type Page } from '@playwright/test';

export async function gotoReady(page: Page, path = '/') {
	await page.goto(path);
	await expect(page.getByTestId('world-map')).toHaveAttribute('data-ready', 'true');
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
			await route.fulfill({ body, contentType: 'application/json' });
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
