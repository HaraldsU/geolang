import { test, expect } from '@playwright/test';
import { gotoReady, isMobile } from './helpers';

const TOGGLES = ['script-toggle', 'projection-toggle', 'theme-toggle'];

test.beforeEach(async ({ page }) => {
	await gotoReady(page);
});

test('wider screens show the toggles without a settings button', async ({ page }, testInfo) => {
	test.skip(isMobile(testInfo.project.name), 'phones hide the toggles');
	await expect(page.getByTestId('settings-button')).toBeHidden();
	for (const id of TOGGLES) await expect(page.getByTestId(id)).toBeVisible();
});

test.describe('phones', () => {
	test.beforeEach(({}, testInfo) => {
		test.skip(!isMobile(testInfo.project.name), 'the settings button is for phones');
	});

	test('the toggles are hidden until the settings button is pressed, and hide again', async ({
		page
	}) => {
		const button = page.getByTestId('settings-button');
		await expect(button).toBeVisible();
		await expect(button).toHaveAttribute('aria-expanded', 'false');
		for (const id of TOGGLES) await expect(page.getByTestId(id)).toBeHidden();

		await button.click();
		await expect(button).toHaveAttribute('aria-expanded', 'true');
		for (const id of TOGGLES) await expect(page.getByTestId(id)).toBeVisible();

		// picking an option keeps them open
		await page.getByTestId('projection-equal-earth').click();
		await expect(page.getByTestId('world-map')).toHaveAttribute('data-projection', 'equal-earth');
		await expect(page.getByTestId('theme-toggle')).toBeVisible();

		await button.click();
		await expect(button).toHaveAttribute('aria-expanded', 'false');
		for (const id of TOGGLES) await expect(page.getByTestId(id)).toBeHidden();
	});

	test('the toggles open above the settings button, inside the screen', async ({ page }) => {
		const button = page.getByTestId('settings-button');
		await button.click();
		const b = (await button.boundingBox())!;
		const vp = page.viewportSize()!;
		for (const id of TOGGLES) {
			const t = (await page.getByTestId(id).boundingBox())!;
			expect(t.y + t.height).toBeLessThanOrEqual(b.y);
			expect(t.x).toBeGreaterThanOrEqual(0);
			expect(t.x + t.width).toBeLessThanOrEqual(vp.width);
		}
	});

	test('Escape or tapping the map closes the settings', async ({ page }) => {
		const button = page.getByTestId('settings-button');
		await button.click();
		await page.getByTestId('script-native').focus();
		await page.keyboard.press('Escape');
		await expect(button).toHaveAttribute('aria-expanded', 'false');
		await expect(button).toBeFocused();

		await button.click();
		const map = (await page.getByTestId('map-container').boundingBox())!;
		await page.mouse.click(map.x + map.width * 0.75, map.y + map.height * 0.3);
		await expect(button).toHaveAttribute('aria-expanded', 'false');
		await expect(page.getByTestId('script-toggle')).toBeHidden();
	});
});
