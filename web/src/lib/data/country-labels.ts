import type { Concept } from './lookup.js';
import type { Countries, Languages, ScriptMode } from './types.js';

export interface LanguageForm {
	code: string;
	name: string;
	native: string | null;
	/** Latin form; equals native for Latin-script languages; null if no romanization exists */
	latin: string | null;
	dir: 'ltr' | 'rtl';
	font: string;
}

export interface CountryLabel {
	iso: string;
	/** text shown on the map for the current mode */
	text: string;
	/** language shown on the map (null for N/A) */
	shown: LanguageForm | null;
	/** all official languages of the country, in priority order */
	forms: LanguageForm[];
	/** number of other official languages that also have a translation */
	more: number;
	na: boolean;
	/** shown in native script although Latin mode is on (no romanization available) */
	nativeFallback: boolean;
}

export const NA = 'N/A';

export function languageForms(
	codes: string[],
	languages: Languages,
	concept: Concept | null
): LanguageForm[] {
	return codes.map((code) => {
		const meta = languages[code];
		const t = concept?.translations[code];
		const native = t ? t[0] : null;
		const latin = t ? (t[1] ?? (meta?.latin ? t[0] : null)) : null;
		return {
			code,
			name: meta?.name ?? code,
			native,
			latin,
			dir: meta?.dir ?? 'ltr',
			font: meta?.font ?? 'Noto Sans'
		};
	});
}

export function buildCountryLabels(
	countries: Countries,
	languages: Languages,
	concept: Concept | null,
	mode: ScriptMode
): Map<string, CountryLabel> {
	const out = new Map<string, CountryLabel>();
	if (!concept) return out;
	for (const [iso, country] of Object.entries(countries)) {
		if (!country.languages.length) continue;
		const forms = languageForms(country.languages, languages, concept);
		const available = forms.filter((f) => f.native);
		const shown = available[0] ?? null;
		let text = NA;
		let nativeFallback = false;
		if (shown) {
			if (mode === 'latin' && shown.latin) text = shown.latin;
			else {
				text = shown.native!;
				nativeFallback = mode === 'latin';
			}
		}
		out.set(iso, {
			iso,
			text,
			shown,
			forms,
			more: Math.max(0, available.length - 1),
			na: !shown,
			nativeFallback
		});
	}
	return out;
}
