import { afterEach, describe, expect, it, vi } from 'vitest';
import { fontStack, HAN_FALLBACK_FAMILIES, registerFallbackFonts } from './fonts.js';

describe('fontStack', () => {
	it('keeps non-Han stacks short', () => {
		expect(fontStack('Noto Sans Arabic')).toBe(
			"'Noto Sans Arabic', 'Noto Sans', system-ui, sans-serif"
		);
	});

	it('lets Han text fall back across all CJK fonts, then the rare-character fallbacks', () => {
		expect(fontStack('Noto Sans TC')).toBe(
			"'Noto Sans TC', 'Noto Sans SC', 'Noto Sans JP', 'Noto Sans KR', " +
				"'Geolang Han Fallback', 'Geolang Han Fallback Ext', 'Noto Sans', system-ui, sans-serif"
		);
		const jp = fontStack('Noto Sans JP');
		expect(jp.startsWith("'Noto Sans JP', 'Noto Sans TC'")).toBe(true);
		for (const f of HAN_FALLBACK_FAMILIES) expect(jp).toContain(`'${f}'`);
	});
});

describe('registerFallbackFonts', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('adds one face per file, with its range and weight, only once', () => {
		const added: unknown[] = [];
		vi.stubGlobal(
			'FontFace',
			class {
				constructor(
					readonly family: string,
					readonly source: string,
					readonly descriptors: FontFaceDescriptors
				) {}
			}
		);
		vi.stubGlobal('document', { fonts: { add: (f: unknown) => added.push(f) } });
		const fonts = [
			{
				file: 'fonts/han-fallback-1.woff2',
				family: 'Geolang Han Fallback',
				weight: 700,
				unicodeRange: 'U+58CB'
			},
			{
				file: 'fonts/han-fallback-2.woff2',
				family: 'Geolang Han Fallback Ext',
				weight: 400,
				unicodeRange: 'U+21CDE'
			}
		];
		registerFallbackFonts('/data/v1', fonts);
		registerFallbackFonts('/data/v1', fonts);
		expect(added).toEqual([
			{
				family: 'Geolang Han Fallback',
				source: "url(/data/v1/fonts/han-fallback-1.woff2) format('woff2')",
				descriptors: { weight: '700', unicodeRange: 'U+58CB', display: 'swap' }
			},
			{
				family: 'Geolang Han Fallback Ext',
				source: "url(/data/v1/fonts/han-fallback-2.woff2) format('woff2')",
				descriptors: { weight: '400', unicodeRange: 'U+21CDE', display: 'swap' }
			}
		]);
	});
});
