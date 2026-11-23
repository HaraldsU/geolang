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

export function fontStack(primary: string): string {
	return `'${primary}', 'Noto Sans', system-ui, sans-serif`;
}
