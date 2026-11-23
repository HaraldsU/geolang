import { describe, expect, it } from 'vitest';
import { senseLabel } from './sense-label.js';
import type { ConceptRef } from './lookup.js';
import type { Languages } from './types.js';

const ref = (langs: string[], gloss = 'relatively great in extent'): ConceptRef => ({
	id: 'x',
	word: 'thick',
	pos: 'adj',
	gloss,
	weight: 1,
	langs
});
const lang = (name: string) => ({
	name,
	script: 'Latn',
	dir: 'ltr' as const,
	font: 'Noto Sans',
	latin: true
});
const languages: Languages = {
	de: lang('German'),
	nl: lang('Dutch'),
	da: lang('Danish'),
	en: lang('English')
};

describe('senseLabel', () => {
	it('leaves English matches unlabelled', () => {
		expect(senseLabel(ref(['en']), languages)).toBe(
			'thick (adjective): relatively great in extent'
		);
		expect(senseLabel(ref(['de', 'en']), languages)).toBe(
			'thick (adjective): relatively great in extent'
		);
	});

	it('names the language of a match in another language', () => {
		expect(senseLabel(ref(['de']), languages)).toBe(
			'[German] thick (adjective): relatively great in extent'
		);
	});

	it('lists a few languages alphabetically and summarises the rest', () => {
		expect(senseLabel(ref(['nl', 'de']), languages)).toMatch(/^\[Dutch, German\] /);
		expect(senseLabel(ref(['nl', 'de', 'da']), languages)).toMatch(/^\[Danish, Dutch \+1\] /);
	});

	it('falls back to the code before language names have loaded, and handles old data', () => {
		expect(senseLabel(ref(['de']))).toMatch(/^\[de\] /);
		expect(senseLabel(ref([]), languages)).toBe('thick (adjective): relatively great in extent');
		expect(senseLabel(ref(['de'], ''), languages)).toBe('[German] thick (adjective)');
	});
});
