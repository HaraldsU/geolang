/**
 * The map's last URL (its search, script and projection: `/?q=hello&script=native`), so that
 * leaving for another page and following its "back to the map" link restores the search.
 * Kept in memory only: it lasts as long as the app is open in this tab.
 */
let last = '/';

export function rememberMapUrl(url: string) {
	last = url.startsWith('/') && !url.startsWith('//') ? url : '/';
}

export function mapUrl() {
	return last;
}
