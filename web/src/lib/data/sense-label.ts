import type { ConceptRef } from './lookup.js';
import type { Languages } from './types.js';

const POS_NAMES: Record<string, string> = {
	noun: 'noun',
	verb: 'verb',
	adj: 'adjective',
	adv: 'adverb',
	intj: 'interjection',
	phrase: 'phrase',
	pron: 'pronoun',
	prep: 'preposition',
	num: 'numeral',
	conj: 'conjunction',
	name: 'name'
};

/** How many matched languages are named before the rest is summarised as "+N". */
const MAX_NAMED_LANGUAGES = 2;

/**
 * The languages a search hit matched in, when that is not English: searching "dick" also finds
 * German "dick" (thick). Empty for English matches and for data without language information.
 */
export function matchedLanguages(r: ConceptRef, languages: Languages | null): string {
	if (!r.langs.length || r.langs.includes('en')) return '';
	const names = r.langs.map((code) => languages?.[code]?.name ?? code).sort();
	const shown = names.slice(0, MAX_NAMED_LANGUAGES).join(', ');
	const rest = names.length - MAX_NAMED_LANGUAGES;
	return rest > 0 ? `${shown} +${rest}` : shown;
}

/** e.g. "[German] thick (adjective): relatively great in extent from one surface to another" */
export function senseLabel(r: ConceptRef, languages: Languages | null = null): string {
	const pos = POS_NAMES[r.pos] ?? r.pos;
	const meaning = r.gloss ? `${r.word} (${pos}): ${r.gloss}` : `${r.word} (${pos})`;
	const langs = matchedLanguages(r, languages);
	return langs ? `[${langs}] ${meaning}` : meaning;
}
