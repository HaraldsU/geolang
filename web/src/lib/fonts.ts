// Self-hosted Noto fonts. Each @font-face carries a unicode-range, so the browser only downloads
// a script's font file when a label actually contains characters from that script.
import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-sans/600.css';
import '@fontsource/noto-sans/800.css';
import '@fontsource/noto-sans-arabic/600.css';
import '@fontsource/noto-sans-hebrew/600.css';
import '@fontsource/noto-sans-thaana/600.css';
import '@fontsource/noto-sans-devanagari/600.css';
import '@fontsource/noto-sans-bengali/600.css';
import '@fontsource/noto-sans-tamil/600.css';
import '@fontsource/noto-sans-sinhala/600.css';
import '@fontsource/noto-sans-thai/600.css';
import '@fontsource/noto-sans-lao/600.css';
import '@fontsource/noto-sans-khmer/600.css';
import '@fontsource/noto-sans-myanmar/600.css';
import '@fontsource/noto-sans-ethiopic/600.css';
import '@fontsource/noto-sans-georgian/600.css';
import '@fontsource/noto-sans-armenian/600.css';
import '@fontsource/noto-sans-sc/600.css';
import '@fontsource/noto-sans-tc/600.css';
import '@fontsource/noto-sans-jp/600.css';
import '@fontsource/noto-sans-kr/600.css';
import '@fontsource/noto-sans-tifinagh/400.css';
import '@fontsource/noto-serif-tibetan/600.css';

/** The self-hosted Han fonts. Google's slices of them each lack some characters another one has. */
const HAN_FONTS = ['Noto Sans TC', 'Noto Sans SC', 'Noto Sans JP', 'Noto Sans KR'];
/**
 * Fallbacks for rare Han characters none of the above can draw, built by the data pipeline
 * (`python -m geolang fonts`) and listed in manifest.json. Keep in sync with pipeline/geolang/fonts.py.
 */
export const HAN_FALLBACK_FAMILIES = ['Geolang Han Fallback', 'Geolang Han Fallback Ext'];

export interface FallbackFont {
	/** path relative to the data version directory */
	file: string;
	family: string;
	weight: number;
	unicodeRange: string;
}

export function fontStack(primary: string): string {
	const families = HAN_FONTS.includes(primary)
		? [primary, ...HAN_FONTS.filter((f) => f !== primary), ...HAN_FALLBACK_FAMILIES]
		: [primary];
	return [...families.map((f) => `'${f}'`), "'Noto Sans'", 'system-ui', 'sans-serif'].join(', ');
}

let registered = false;

/**
 * Registers the pipeline-built fallback fonts. Thanks to unicode-range, a file is only downloaded
 * once a character it covers is actually shown.
 */
export function registerFallbackFonts(baseUrl: string, fonts: readonly FallbackFont[] = []): void {
	if (registered || typeof FontFace === 'undefined') return;
	registered = true;
	for (const f of fonts) {
		const face = new FontFace(f.family, `url(${baseUrl}/${f.file}) format('woff2')`, {
			weight: String(f.weight),
			unicodeRange: f.unicodeRange,
			display: 'swap'
		});
		document.fonts.add(face);
	}
}
