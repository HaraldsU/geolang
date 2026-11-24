import { defineConfig, devices } from '@playwright/test';

/**
 * Map performance benchmark (`npm run bench:pan`). Not part of the test suite: timings depend
 * on the machine. Unlike the E2E suite it serves the real generated data (run the pipeline
 * first), on its own port so it never reuses an E2E server that hides that data.
 *
 *   npm run bench:pan                          # all projects, headless
 *   npm run bench:pan -- --project=chromium-dpr2 --headed   # real GPU
 *   BENCH_LABEL=before npm run bench:pan; then BENCH_COMPARE=before npm run bench:pan
 *   BENCH_GPU=1 npm run bench:pan              # Chromium on the real GPU instead of SwiftShader
 */
const PORT = 4175;
// ANGLE on the system's GPU: closer to what users see than headless Chromium's software GL
const gpu = process.env.BENCH_GPU
	? {
			launchOptions: {
				args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist']
			}
		}
	: {};

export default defineConfig({
	testDir: '.',
	testMatch: '*.bench.ts',
	timeout: 300_000,
	workers: 1, // one browser at a time: they would compete for the CPU
	reporter: 'list',
	use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 1600, height: 900 } },
	projects: [
		{
			name: 'chromium-dpr1',
			use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 900 }, ...gpu }
		},
		{
			name: 'chromium-dpr2',
			use: {
				...devices['Desktop Chrome'],
				viewport: { width: 1600, height: 900 },
				deviceScaleFactor: 2,
				...gpu
			}
		},
		{
			name: 'firefox-dpr1',
			use: { ...devices['Desktop Firefox'], viewport: { width: 1600, height: 900 } }
		}
	],
	webServer: {
		command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
		port: PORT,
		reuseExistingServer: true,
		timeout: 180_000
	}
});
