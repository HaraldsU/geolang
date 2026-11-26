import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';

type HeaderRule = { pattern: RegExp; headers: [string, string][] };

/** Parse Cloudflare Pages' static/_headers so `vite preview` serves the same headers. */
function headerRules(): HeaderRule[] {
	const lines = readFileSync(new URL('./static/_headers', import.meta.url), 'utf-8').split('\n');
	const rules: HeaderRule[] = [];
	for (const line of lines) {
		if (!line.trim() || line.trim().startsWith('#')) continue;
		if (!/^\s/.test(line)) {
			const escaped = line
				.trim()
				.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
				.replace(/\*/g, '.*');
			rules.push({ pattern: new RegExp(`^${escaped}$`), headers: [] });
			continue;
		}
		const i = line.indexOf(':');
		if (i > 0 && rules.length)
			rules.at(-1)!.headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
	}
	return rules;
}

function cloudflareHeaders(): Plugin {
	return {
		name: 'cloudflare-headers-preview',
		configurePreviewServer(server) {
			const rules = headerRules();
			server.middlewares.use((req, res, next) => {
				const path = (req.url ?? '/').split('?')[0];
				for (const rule of rules) {
					if (rule.pattern.test(path)) for (const [k, v] of rule.headers) res.setHeader(k, v);
				}
				next();
			});
		}
	};
}

/**
 * E2E runs serve no generated translation data (static/data/manifest.json and v<date>/), even
 * when it has been built locally: CI never has it (it is gitignored), so a test that needs real
 * data would pass locally and fail in CI. Tests use the fixture data instead (useFixtureData).
 */
function hideGeneratedData(): Plugin {
	return {
		name: 'hide-generated-data',
		configurePreviewServer(server) {
			if (!process.env.E2E_HIDE_DATA) return;
			server.middlewares.use((req, res, next) => {
				if (!/^\/data\/(manifest\.json|v\d[^/]*\/)/.test((req.url ?? '/').split('?')[0])) {
					return next();
				}
				res.statusCode = 404;
				res.end('not found');
			});
		}
	};
}

export default defineConfig({
	plugins: [
		hideGeneratedData(),
		cloudflareHeaders(),
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ fallback: undefined, strict: true }),
			// Without translation data (a fresh checkout) there are no word pages to prerender.
			prerender: { handleUnseenRoutes: 'ignore' },
			// Hash-based CSP: SvelteKit emits a <meta> policy with hashes of its own inline scripts,
			// so no 'unsafe-inline' is needed for scripts. The only third party allowed is Cloudflare
			// Web Analytics (cookieless page views): Cloudflare Pages adds its beacon script to the
			// HTML when it is enabled for the project, and the beacon reports to cloudflareinsights.com.
			csp: {
				mode: 'hash',
				directives: {
					'default-src': ['self'],
					'script-src': ['self', 'https://static.cloudflareinsights.com'],
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'data:'],
					'font-src': ['self'],
					'connect-src': ['self', 'https://cloudflareinsights.com'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'form-action': ['self']
				}
			}
		})
	],
	// Never inline assets as data: URIs (fonts would be blocked by the font-src 'self' CSP).
	build: { assetsInlineLimit: 0 },
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node'
	}
});
