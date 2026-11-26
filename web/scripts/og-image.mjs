// Renders static/og.png, the 1200×630 preview image social sites show for shared links: the map
// with "hello" searched, in native scripts. Run it against a preview server that has the real translation data:
//   npm run build && npm run preview &   then   node scripts/og-image.mjs [http://localhost:4173]
// The image is committed, so builds don't depend on this script.
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:4173';
const browser = await chromium.launch();
const page = await browser.newPage({
	viewport: { width: 1200, height: 630 },
	colorScheme: 'light'
});
await page.goto(`${base}/?q=hello&script=native`);
await page.getByTestId('world-map').and(page.locator('[data-ready="true"]')).waitFor();
await page.getByTestId('label-FR').waitFor({ state: 'attached' });
// only the search and the map: no toggles, zoom buttons, sense picker or footer links
await page.addStyleTag({
	content:
		'.toggles, .settings-button, .controls-slot, .credits, .status-slot { display: none !important; }'
});
// zoom in on Europe, Africa and Asia so more countries are big enough for their labels
await page.mouse.move(640, 330);
for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -100);
await page.waitForTimeout(2000); // the zoom, fonts and the label layout settle
await page.screenshot({ path: new URL('../static/og.png', import.meta.url).pathname });
await browser.close();
console.log('Wrote static/og.png');
