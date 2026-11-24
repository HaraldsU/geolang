import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { THEME_KEY, parseTheme } from './theme.svelte.js';

describe('theme', () => {
	it('accepts only light and dark from storage', () => {
		expect(parseTheme('light')).toBe('light');
		expect(parseTheme('dark')).toBe('dark');
		for (const bad of [null, undefined, '', 'Dark', 'system', 'toString', 1]) {
			expect(parseTheme(bad)).toBeNull();
		}
	});

	it('uses the same storage key as the pre-paint script in app.html', () => {
		const html = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
		expect(html).toContain(`localStorage.getItem('${THEME_KEY}')`);
	});
});
