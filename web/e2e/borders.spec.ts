import { test, expect, type Page } from '@playwright/test';
import { gotoReady, isMobile, selectCountry } from './helpers';

/**
 * The southernmost point of a country's shape: its screen position, how far across the country's
 * width it lies (0 = west edge, 1 = east edge), and which countries' shapes contain it.
 */
async function southernmostPoint(page: Page, iso: string) {
	return page.locator(`path.country[data-iso="${iso}"]`).evaluate((el) => {
		const path = el as SVGPathElement;
		const b = path.getBBox();
		const steps = 400;
		for (let row = 0; row <= steps; row++) {
			const y = b.y + b.height * (1 - row / steps);
			for (let col = 0; col <= steps; col++) {
				const x = b.x + (b.width * col) / steps;
				if (!path.isPointInFill(new DOMPoint(x, y))) continue;
				const inland = new DOMPoint(x, y - b.height * 0.01); // so a click lands on the country
				const owners = [...document.querySelectorAll<SVGPathElement>('path.country')]
					.filter((p) => p.isPointInFill(inland))
					.map((p) => p.dataset.iso);
				const screen = inland.matrixTransform(path.getScreenCTM()!);
				return { x: screen.x, y: screen.y, across: col / steps, owners };
			}
		}
		throw new Error(`no fill in ${path.dataset.iso}`);
	});
}

// Crimea's south coast is Ukraine's southernmost point, in its east; drawn as Russia's (de facto),
// Ukraine's southernmost point would be the Danube delta in the west.
test('Crimea is drawn as part of Ukraine', async ({ page }) => {
	await gotoReady(page);
	const tip = await southernmostPoint(page, 'UA');
	expect(tip.across).toBeGreaterThan(0.55);
	expect(tip.owners).toEqual(['UA']);
});

test('clicking Crimea selects Ukraine', async ({ page }, testInfo) => {
	test.skip(isMobile(testInfo.project.name), 'Crimea is off-screen in the portrait default view');
	await gotoReady(page);
	const tip = await southernmostPoint(page, 'UA');
	expect(tip.across).toBeGreaterThan(0.55); // in Crimea
	await page.mouse.click(tip.x, tip.y);
	await expect(page.getByTestId('country-panel')).toHaveAttribute('data-iso', 'UA');
});

test('disputed areas are outlined with dashed lines', async ({ page }) => {
	await gotoReady(page);
	await expect
		.poll(async () => Number(await page.getByTestId('map-canvas').getAttribute('data-disputed')))
		.toBeGreaterThan(10);
});

test('country panels explain the disputes the country is part of', async ({ page }) => {
	await gotoReady(page);
	for (const iso of ['UA', 'RU']) {
		await selectCountry(page, iso);
		const notes = page.getByTestId('disputes');
		await expect(notes).toContainText('Crimea:');
		await expect(notes).toContainText('UN General Assembly resolution 68/262');
	}
	await selectCountry(page, 'CY');
	await expect(page.getByTestId('disputes')).toContainText('Northern Cyprus:');

	await selectCountry(page, 'DE');
	await expect(page.getByTestId('disputes')).toHaveCount(0);
});

test('the hover tooltip stays compact, without dispute notes', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop-chrome', 'hover needs a mouse');
	await gotoReady(page);
	const tip = await southernmostPoint(page, 'UA');
	await page.mouse.move(tip.x, tip.y);
	await expect(page.getByTestId('country-tooltip')).toHaveAttribute('data-iso', 'UA');
	await expect(page.getByTestId('country-tooltip').getByTestId('disputes')).toHaveCount(0);
});
