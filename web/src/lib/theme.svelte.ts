/**
 * Light/dark theme. Follows the system preference until the user picks one, which is then
 * remembered. The theme is the `data-theme` attribute on <html>; app.html sets it before the
 * first paint (same storage key) so a remembered choice never flashes the other theme.
 */

export type Theme = 'light' | 'dark';

export const THEME_KEY = 'geolang-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

/** A theme from untrusted input (storage), or null. */
export function parseTheme(value: unknown): Theme | null {
	return value === 'light' || value === 'dark' ? value : null;
}

function stored(): Theme | null {
	try {
		return parseTheme(localStorage.getItem(THEME_KEY));
	} catch {
		return null; // storage blocked
	}
}

const system = (): Theme => (matchMedia(DARK_QUERY).matches ? 'dark' : 'light');

export const theme = $state<{ value: Theme }>({ value: 'light' });

function apply(t: Theme) {
	theme.value = t;
	const root = document.documentElement;
	root.dataset.theme = t;
	// the browser UI (e.g. the mobile address bar) matches the page background
	const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
	document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
}

/** Apply the remembered or system theme and follow system changes; returns a cleanup. */
export function initTheme(): () => void {
	apply(stored() ?? system());
	const query = matchMedia(DARK_QUERY);
	const onChange = () => {
		if (!stored()) apply(system());
	};
	query.addEventListener('change', onChange);
	return () => query.removeEventListener('change', onChange);
}

/** The user's choice: applied and remembered. */
export function setTheme(t: Theme) {
	apply(t);
	try {
		localStorage.setItem(THEME_KEY, t);
	} catch {
		// storage blocked: the choice lasts for this page only
	}
}
