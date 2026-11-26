import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
	testDir: 'e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? 'github' : 'list',
	use: {
		baseURL: process.env.BASE_URL ?? `http://localhost:${PORT}`,
		trace: 'retain-on-failure'
	},
	expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.02 } },
	projects: [
		{ name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
		{ name: 'desktop-firefox', use: { ...devices['Desktop Firefox'] } },
		{ name: 'desktop-safari', use: { ...devices['Desktop Safari'] } },
		{ name: 'pixel-7', use: { ...devices['Pixel 7'] } },
		{ name: 'iphone-14', use: { ...devices['iPhone 14'] } },
		{ name: 'ipad', use: { ...devices['iPad (gen 7)'] } }
	],
	webServer: process.env.BASE_URL
		? undefined
		: {
				// E2E_PREBUILT: serve the build scripts/test-all.sh has just made instead of building again
				command: `${process.env.E2E_PREBUILT ? '' : 'npm run build && '}npm run preview -- --port ${PORT} --strictPort`,
				port: PORT,
				// as in CI, where it is never built: see hideGeneratedData in vite.config.ts
				// word pages are prerendered from the fixture data, so they are the same everywhere
				env: { E2E_HIDE_DATA: '1', GEOLANG_DATA_DIR: 'e2e/fixtures/data' },
				reuseExistingServer: !process.env.CI,
				timeout: 180_000
			}
});
