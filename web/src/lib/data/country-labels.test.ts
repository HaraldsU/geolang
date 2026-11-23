import { describe, expect, it } from 'vitest';
import { buildCountryLabels, NA } from './country-labels.js';
import type { Concept } from './lookup.js';
import type { Countries, Languages } from './types.js';

const languages: Languages = {
	fr: { name: 'French', script: 'Latn', dir: 'ltr', font: 'Noto Sans', latin: true },
	de: { name: 'German', script: 'Latn', dir: 'ltr', font: 'Noto Sans', latin: true },
	it: { name: 'Italian', script: 'Latn', dir: 'ltr', font: 'Noto Sans', latin: true },
	ru: { name: 'Russian', script: 'Cyrl', dir: 'ltr', font: 'Noto Sans', latin: false },
	ar: { name: 'Arabic', script: 'Arab', dir: 'rtl', font: 'Noto Sans Arabic', latin: false },
	ja: { name: 'Japanese', script: 'Jpan', dir: 'ltr', font: 'Noto Sans JP', latin: false },
	xx: { name: 'Nowhere', script: 'Latn', dir: 'ltr', font: 'Noto Sans', latin: true }
};
const countries: Countries = {
	FR: { name: 'France', languages: ['fr'] },
	RU: { name: 'Russia', languages: ['ru'] },
	CH: { name: 'Switzerland', languages: ['de', 'fr', 'it'] },
	EG: { name: 'Egypt', languages: ['ar'] },
	JP: { name: 'Japan', languages: ['ja'] },
	XX: { name: 'Nowhere', languages: ['xx'] },
	AQ: { name: 'Antarctica', languages: [] }
};
const concept: Concept = {
	id: 'a1',
	word: 'hello',
	pos: 'intj',
	gloss: 'greeting',
	translations: {
		fr: ['bonjour', null],
		de: ['hallo', null],
		it: ['ciao', null],
		ru: ['привет', 'privet'],
		ar: ['مرحبا', 'marḥaban'],
		ja: ['今日は', null]
	}
};

describe('buildCountryLabels', () => {
	it('is empty without a concept', () => {
		expect(buildCountryLabels(countries, languages, null, 'latin').size).toBe(0);
	});

	it('shows Latin forms by default', () => {
		const l = buildCountryLabels(countries, languages, concept, 'latin');
		expect(l.get('FR')!.text).toBe('bonjour');
		expect(l.get('RU')!.text).toBe('privet');
		expect(l.get('EG')!.text).toBe('marḥaban');
	});

	it('shows native script when toggled', () => {
		const l = buildCountryLabels(countries, languages, concept, 'native');
		expect(l.get('FR')!.text).toBe('bonjour');
		expect(l.get('RU')!.text).toBe('привет');
		expect(l.get('EG')!.text).toBe('مرحبا');
		expect(l.get('EG')!.shown!.dir).toBe('rtl');
	});

	it('marks missing translations as N/A and skips countries without languages', () => {
		const l = buildCountryLabels(countries, languages, concept, 'latin');
		expect(l.get('XX')!.text).toBe(NA);
		expect(l.get('XX')!.na).toBe(true);
		expect(l.has('AQ')).toBe(false);
	});

	it('counts additional official languages', () => {
		const ch = buildCountryLabels(countries, languages, concept, 'latin').get('CH')!;
		expect(ch.text).toBe('hallo');
		expect(ch.more).toBe(2);
		expect(ch.forms.map((f) => f.native)).toEqual(['hallo', 'bonjour', 'ciao']);
	});

	it('falls back to native script when no romanization exists', () => {
		const jp = buildCountryLabels(countries, languages, concept, 'latin').get('JP')!;
		expect(jp.text).toBe('今日は');
		expect(jp.nativeFallback).toBe(true);
	});

	it('uses the next official language when the first has no translation', () => {
		const partial = { ...concept, translations: { it: ['ciao', null] as [string, null] } };
		const ch = buildCountryLabels(countries, languages, partial, 'latin').get('CH')!;
		expect(ch.text).toBe('ciao');
		expect(ch.more).toBe(0);
	});
});
