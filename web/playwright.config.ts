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
				command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
				port: PORT,
				reuseExistingServer: !process.env.CI,
				timeout: 180_000
			}
});
