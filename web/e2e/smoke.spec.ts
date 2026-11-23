import { test, expect } from '@playwright/test';
import { gotoReady } from './helpers';

test('page loads with title and no console errors', async ({ page }) => {
	const errors: string[] = [];
	page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
	page.on('pageerror', (e) => errors.push(e.message));

	await gotoReady(page);
	await expect(page).toHaveTitle('geolang');
	await expect(page.getByTestId('navbar')).toBeVisible();
	expect(errors).toEqual([]);
});
