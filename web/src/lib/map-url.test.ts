import { describe, expect, it } from 'vitest';
import { mapUrl, rememberMapUrl } from './map-url.js';

describe('mapUrl', () => {
	it('returns the URL the map last had', () => {
		rememberMapUrl('/?q=hello&script=native');
		expect(mapUrl()).toBe('/?q=hello&script=native');
		rememberMapUrl('/');
		expect(mapUrl()).toBe('/');
	});

	it('only keeps paths on this site', () => {
		rememberMapUrl('https://example.com/');
		expect(mapUrl()).toBe('/');
		rememberMapUrl('//example.com/');
		expect(mapUrl()).toBe('/');
	});
});
