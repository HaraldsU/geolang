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

test('third-party requests are never made', async ({ page }) => {
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
