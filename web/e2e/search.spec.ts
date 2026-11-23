import { test, expect } from '@playwright/test';
import { gotoReady, labelText, search, selectCountry, useFixtureData } from './helpers';

test.beforeEach(async ({ page }) => {
	await useFixtureData(page);
	await gotoReady(page);
});

test('typing a word labels countries in Latin script by default', async ({ page }) => {
	await search(page, 'hello');
	await expect(page.getByTestId('status')).toHaveAttribute('data-status', 'done');
	await expect.poll(() => labelText(page, 'FR')).toBe('bonjour');
	await expect.poll(() => labelText(page, 'ES')).toBe('hola');
	await expect.poll(() => labelText(page, 'RU')).toBe('zdravstvujte');
	await expect.poll(() => labelText(page, 'CN')).toBe('nǐ hǎo');
	expect(
		await page.locator('[data-testid="labels"] [data-visible="true"]').count()
	).toBeGreaterThan(5);
});

test('debounced typing searches without pressing Enter', async ({ page }) => {
	await page.getByTestId('search-input').pressSequentially('hello', { delay: 30 });
	await expect.poll(() => labelText(page, 'FR'), { timeout: 5000 }).toBe('bonjour');
});

test('toggling to native script switches non-Latin labels only', async ({ page }) => {
	await search(page, 'hello');
	await expect.poll(() => labelText(page, 'RU')).toBe('zdravstvujte');
	await page.getByTestId('script-native').click();
	await expect.poll(() => labelText(page, 'RU')).toBe('здравствуйте');
	await expect.poll(() => labelText(page, 'CN')).toBe('你好');
	await expect.poll(() => labelText(page, 'FR')).toBe('bonjour');
	await expect(page.getByTestId('script-native')).toHaveAttribute('aria-checked', 'true');
	await page.getByTestId('script-latin').click();
	await expect.poll(() => labelText(page, 'RU')).toBe('zdravstvujte');
});

test('countries without a translation show N/A', async ({ page }) => {
	await search(page, 'testword');
	await expect.poll(() => labelText(page, 'FR')).toBe('motessai');
	await expect.poll(() => labelText(page, 'RU')).toBe('N/A');
	await expect(page.locator('[data-testid="labels"] .label[data-iso="RU"]')).toHaveClass(/na/);
	await expect(page.locator('[data-testid="labels"] .label[data-iso="AQ"]')).toHaveCount(0);
});

test('multi-language countries show a +N chip and list all languages', async ({
	page,
	hasTouch
}) => {
	await search(page, 'hello');
	await expect(page.getByTestId('chip-CH')).toHaveText('+2');
	if (hasTouch) {
		await selectCountry(page, 'CH');
		const panel = page.getByTestId('country-panel');
		await expect(panel.locator('li')).toHaveCount(3);
		await expect(panel).toContainText('German');
		await expect(panel).toContainText('bonjour');
		// bottom sheet on phones, floating card on tablets
		const box = (await panel.boundingBox())!;
		const vp = page.viewportSize()!;
		if (vp.width < 768) expect(box.y + box.height).toBeGreaterThan(vp.height - 2);
		else expect(box.width).toBeLessThan(vp.width / 2);
	} else {
		await page.locator('path.country[data-iso="CH"]').hover({ force: true });
		const tip = page.getByTestId('country-tooltip');
		await expect(tip).toHaveAttribute('data-iso', 'CH');
		await expect(tip.locator('li')).toHaveCount(3);
		await expect(tip).toContainText('Italian');
		await expect(tip).toContainText('ciao');
	}
});

test('country panel shows native and Latin forms and closes', async ({ page }) => {
	await search(page, 'hello');
	await expect.poll(() => labelText(page, 'RU')).toBe('zdravstvujte');
	await selectCountry(page, 'RU');
	const panel = page.getByTestId('country-panel');
	await expect(panel).toContainText('Russia');
	await expect(panel).toContainText('здравствуйте');
	await expect(panel).toContainText('zdravstvujte');
	await page.getByTestId('panel-close').click();
	await expect(panel).toHaveCount(0);
});

test('ambiguous words offer a sense picker', async ({ page }) => {
	await search(page, 'bank');
	const picker = page.getByTestId('sense-picker');
	await expect(picker).toBeVisible();
	expect(await picker.locator('option').count()).toBeGreaterThan(3);
	await expect.poll(() => labelText(page, 'FR')).toBe('banque');
	const river = picker.locator('option', { hasText: 'edge of river or lake' });
	await picker.selectOption((await river.getAttribute('value'))!);
	await expect.poll(() => labelText(page, 'FR')).toBe('rive');
	await expect(page).toHaveURL(/sense=/);
});

test('meanings found through another language say which language', async ({ page }) => {
	await search(page, 'bank');
	const options = page.getByTestId('sense-picker').locator('option');
	await expect(options.first()).toHaveText(/^bank \(noun\): institution$/); // English: unlabelled

	await search(page, 'hund');
	await expect(options).toHaveText([
		/^\[Danish, German \+3\] dog \(noun\): animal$/,
		/^\[Swedish\] dog \(noun\): male canine$/,
		/^\[German\] dog \(noun\): morally reprehensible person/
	]);

	await search(page, 'wasser');
	await expect(options.first()).toHaveText(/^\[German\] water \(noun\)/);
});

test('search state lives in the URL and survives reload', async ({ page }) => {
	await search(page, 'hello');
	await expect(page).toHaveURL(/[?&]q=hello/);
	await page.getByTestId('script-native').click();
	await expect(page).toHaveURL(/script=native/);

	await page.goto('/?q=hello&script=native');
	await expect.poll(() => labelText(page, 'RU')).toBe('здравствуйте');
	await expect(page.getByTestId('search-input')).toHaveValue('hello');
	await expect(page.getByTestId('script-native')).toHaveAttribute('aria-checked', 'true');
});

test('chosen sense survives reload', async ({ page }) => {
	await search(page, 'bank');
	const picker = page.getByTestId('sense-picker');
	const river = picker.locator('option', { hasText: 'edge of river or lake' });
	await picker.selectOption((await river.getAttribute('value'))!);
	await expect.poll(() => labelText(page, 'FR')).toBe('rive');
	await page.reload();
	await expect.poll(() => labelText(page, 'FR')).toBe('rive');
});

test('search works from any language or script', async ({ page }) => {
	for (const q of ['bonjour', 'здравствуйте', 'zdravstvujte', '你好']) {
		await search(page, q);
		await expect.poll(() => labelText(page, 'DE')).toBe('hallo');
		await search(page, '');
	}
});

test('unknown words show a "no results" message', async ({ page }) => {
	await search(page, 'qwertyzzz');
	const status = page.getByTestId('status');
	await expect(status).toHaveAttribute('data-status', 'empty');
	await expect(status).toContainText('qwertyzzz');
	await expect(page.locator('[data-testid="labels"] .label')).toHaveCount(0);
});

test('HTML in the query is rendered as text, never executed', async ({ page }) => {
	let dialog = false;
	page.on('dialog', async (d) => {
		dialog = true;
		await d.dismiss();
	});
	const payload = '<img src=x onerror=alert(1)>';
	await search(page, payload);
	const status = page.getByTestId('status');
	await expect(status).toHaveAttribute('data-status', 'empty');
	await expect(status).toContainText(payload);
	await expect(status.locator('img')).toHaveCount(0);
	await page.goto(`/?q=${encodeURIComponent(payload)}`);
	await expect(page.getByTestId('status')).toHaveAttribute('data-status', 'empty');
	await page.waitForTimeout(300);
	expect(dialog).toBe(false);
});

test('network failures show a retry button', async ({ page }) => {
	await page.route(/\/data\/vfixture\/index\//, (r) => r.abort());
	await search(page, 'hello');
	const status = page.getByTestId('status');
	await expect(status).toHaveAttribute('data-status', 'error');
	await page.unroute(/\/data\/vfixture\/index\//);
	await useFixtureData(page);
	await status.getByRole('button', { name: 'Retry' }).click();
	await expect.poll(() => labelText(page, 'FR')).toBe('bonjour');
});

test('the country panel links to a pre-filled report of a wrong translation', async ({ page }) => {
	// no word shown yet: nothing to report
	await selectCountry(page, 'FR');
	await expect(page.getByTestId('report-mistake')).toHaveCount(0);
	await page.getByTestId('panel-close').click();

	await search(page, 'hello');
	await expect.poll(() => labelText(page, 'RU')).toBe('zdravstvujte');
	await selectCountry(page, 'RU');
	const link = page.getByTestId('report-mistake');
	await expect(link).toBeVisible();
	await expect(link).toHaveAttribute('target', '_blank');
	await expect(link).toHaveAttribute('rel', /noopener/);
	const url = new URL((await link.getAttribute('href'))!);
	expect(`${url.origin}${url.pathname}`).toBe('https://github.com/HaraldsU/geolang/issues/new');
	expect(url.searchParams.get('title')).toContain('"hello"');
	expect(url.searchParams.get('title')).toContain('Russia');
	const body = url.searchParams.get('body')!;
	expect(body).toContain('здравствуйте (zdravstvujte)');
	expect(body).toContain('Page: ');
	expect(body).toContain('q=hello');
});
