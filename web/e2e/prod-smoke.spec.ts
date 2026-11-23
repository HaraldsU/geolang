import { test, expect } from '@playwright/test';
import { gotoReady, labelText, search } from './helpers';

// Run against a deployed site with real data: BASE_URL=https://geolang.io npx playwright test --grep @prod
test.describe('production smoke @prod', () => {
	test.skip(!process.env.BASE_URL, 'only runs against a deployed site');

	test('page loads and searching "hello" labels the map', async ({ page }) => {
		await gotoReady(page);
		await search(page, 'hello');
		await expect(page.getByTestId('status')).toHaveAttribute('data-status', 'done');
		await expect.poll(() => labelText(page, 'FR')).toBe('bonjour');
		await expect.poll(() => labelText(page, 'RU')).not.toBe('N/A');
	});

	test('security headers are present', async ({ page }) => {
		const res = await page.goto('/');
		const h = res!.headers();
		expect(h['x-content-type-options']).toBe('nosniff');
		expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
		expect(h['strict-transport-security']).toContain('max-age=');
	});

	test('data files are served with long-lived caching', async ({ request }) => {
		const manifest = await (await request.get('/data/manifest.json')).json();
		const res = await request.get(`/data/${manifest.version}/index/0.json`);
		expect(res.ok()).toBe(true);
		expect(res.headers()['cache-control']).toContain('immutable');
	});
});
