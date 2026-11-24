import { test, expect } from '@playwright/test';

// Locally built translation data must not leak into E2E runs: CI never has it, so a test that
// relied on it would pass here and fail there (see hideGeneratedData in vite.config.ts).
test('the test server serves no generated translation data, as in CI', async ({ request }) => {
	test.skip(!!process.env.BASE_URL, 'a deployed site has real data');
	expect((await request.get('/data/manifest.json')).status()).toBe(404);
	expect((await request.get('/data/v20261123/index/0.json')).status()).toBe(404);
	// the committed country and language data is still served
	expect((await request.get('/data/countries.json')).ok()).toBe(true);
	expect((await request.get('/data/languages.json')).ok()).toBe(true);
});
