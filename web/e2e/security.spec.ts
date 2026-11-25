import { test, expect } from '@playwright/test';
import { gotoReady, search, useFixtureData } from './helpers';

test('security headers are sent', async ({ page }) => {
	const res = await page.goto('/');
	const h = res!.headers();
	expect(h['x-content-type-options']).toBe('nosniff');
	expect(h['x-frame-options']).toBe('DENY');
	expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
	expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
	expect(h['permissions-policy']).toContain('camera=()');
});

test('CSP meta policy has no unsafe-inline scripts', async ({ page }) => {
	await page.goto('/');
	const csp = await page
		.locator('meta[http-equiv="content-security-policy"]')
		.getAttribute('content');
	expect(csp).toContain("default-src 'self'");
	const scriptSrc = csp!.split(';').find((d) => d.trim().startsWith('script-src'))!;
	expect(scriptSrc).not.toContain('unsafe-inline');
	expect(scriptSrc).not.toContain('unsafe-eval');
});

test('CSP blocks injected inline scripts', async ({ page }) => {
	await gotoReady(page);
	const result = await page.evaluate(
		() =>
			new Promise<{ ran: boolean; violation: string | null }>((resolve) => {
				let violation: string | null = null;
				document.addEventListener(
					'securitypolicyviolation',
					(e) => (violation = e.violatedDirective)
				);
				(window as unknown as { __pwned?: boolean }).__pwned = false;
				const s = document.createElement('script');
				s.textContent = 'window.__pwned = true';
				document.body.appendChild(s);
				setTimeout(
					() => resolve({ ran: !!(window as unknown as { __pwned?: boolean }).__pwned, violation }),
					200
				);
			})
	);
	expect(result.ran).toBe(false);
	expect(result.violation).toContain('script-src');
});

test('the CSP allows Cloudflare Web Analytics and no other third party', async ({ page }) => {
	await page.goto('/');
	const csp = (await page
		.locator('meta[http-equiv="content-security-policy"]')
		.getAttribute('content'))!;
	const hosts = csp.match(/https?:\/\/[^\s;']+/g) ?? [];
	expect([...new Set(hosts)].sort()).toEqual([
		'https://cloudflareinsights.com',
		'https://static.cloudflareinsights.com'
	]);
});

test('the Cloudflare Web Analytics beacon is not blocked by the CSP', async ({ page }) => {
	// Cloudflare Pages injects this tag into the HTML at its edge; here it is added by hand and
	// the beacon itself is stubbed, so the test sends nothing to Cloudflare
	await page.route('https://static.cloudflareinsights.com/beacon.min.js', (route) =>
		route.fulfill({
			contentType: 'text/javascript',
			body: "window.__beacon = true; fetch('https://cloudflareinsights.com/cdn-cgi/rum', { method: 'POST', body: '{}' }).catch(() => {});"
		})
	);
	await page.route('https://cloudflareinsights.com/cdn-cgi/rum', (route) =>
		route.fulfill({ status: 204 })
	);
	await gotoReady(page);
	const violations = await page.evaluate(
		() =>
			new Promise<string[]>((resolve) => {
				const seen: string[] = [];
				document.addEventListener('securitypolicyviolation', (e) =>
					seen.push(`${e.violatedDirective} ${e.blockedURI}`)
				);
				const s = document.createElement('script');
				s.defer = true;
				s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
				s.dataset.cfBeacon = '{"token": "test"}';
				document.body.appendChild(s);
				setTimeout(() => resolve(seen), 1000);
			})
	);
	expect(violations).toEqual([]);
	expect(await page.evaluate(() => (window as { __beacon?: boolean }).__beacon)).toBe(true);
});

test('the app itself makes no third-party requests', async ({ page }) => {
	const external: string[] = [];
	page.on('request', (r) => {
		const url = new URL(r.url());
		if (!['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol !== 'data:')
			external.push(r.url());
	});
	await useFixtureData(page);
	await gotoReady(page);
	await search(page, 'hello');
	await expect(page.getByTestId('status')).toHaveAttribute('data-status', 'done');
	expect(external).toEqual([]);
});

test('the about page tells visitors about the analytics', async ({ page }) => {
	await page.goto('/about');
	await expect(page.getByTestId('analytics-note')).toContainText('Cloudflare Web Analytics');
	await expect(page.getByTestId('analytics-note')).toContainText('without cookies');
	// the search is in the page address, which the analytics records
	await expect(page.getByTestId('analytics-note')).toContainText('?q=');
});
