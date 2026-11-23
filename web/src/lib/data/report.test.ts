import { describe, expect, it } from 'vitest';
import { REPORT_REPO, reportUrl } from './report.js';
import type { LanguageForm } from './country-labels.js';

const form = (
	code: string,
	name: string,
	native: string | null,
	latin: string | null
): LanguageForm => ({
	code,
	name,
	native,
	latin,
	dir: 'ltr',
	font: 'Noto Sans'
});

const ctx = {
	concept: { word: 'dick', pos: 'noun', gloss: 'penis' },
	country: { iso: 'LV', name: 'Latvia' },
	forms: [form('lv', 'Latvian', 'vdaikts', 'vdaikts')],
	pageUrl: 'https://geolang.io/?q=dick'
};

function parse(url: string) {
	const u = new URL(url);
	return { base: `${u.origin}${u.pathname}`, params: u.searchParams };
}

describe('reportUrl', () => {
	it('opens a new issue on the project repository', () => {
		const { base, params } = parse(reportUrl(ctx));
		expect(base).toBe(`${REPORT_REPO}/issues/new`);
		expect(params.get('labels')).toBe('translation');
		expect(params.get('title')).toBe('Translation: "dick" (penis) in Latvia');
	});

	it('includes the word, sense, country, shown translations and source entry', () => {
		const body = parse(reportUrl(ctx)).params.get('body')!;
		expect(body).toContain('dick (noun): penis');
		expect(body).toContain('Latvia (LV)');
		expect(body).toContain('- Latvian (`lv`): vdaikts');
		expect(body).toContain('https://en.wiktionary.org/wiki/dick#Translations');
		expect(body).toContain('Page: https://geolang.io/?q=dick');
	});

	it('asks for the correct translation and an explicit, reliable source', () => {
		const body = parse(reportUrl(ctx)).params.get('body')!;
		expect(body).toContain('**Correct translation:**');
		expect(body).toContain('**Source for the correct translation (required):**');
		expect(body).toMatch(/without a\s+verifiable source cannot be accepted/);
	});

	it('shows native and Latin forms, and N/A for missing translations', () => {
		const body = parse(
			reportUrl({
				...ctx,
				country: { iso: 'RU', name: 'Russia' },
				forms: [form('ru', 'Russian', 'привет', 'privet'), form('tt', 'Tatar', null, null)]
			})
		).params.get('body')!;
		expect(body).toContain('- Russian (`ru`): привет (privet)');
		expect(body).toContain('- Tatar (`tt`): N/A');
	});

	it('encodes special characters safely', () => {
		const url = reportUrl({ ...ctx, concept: { word: 'rock & roll', pos: 'noun', gloss: 'a#b' } });
		const { params } = parse(url);
		expect(params.get('title')).toBe('Translation: "rock & roll" (a#b) in Latvia');
		expect(params.get('body')).toContain(
			'https://en.wiktionary.org/wiki/rock_%26_roll#Translations'
		);
	});

	it('stays under the URL length limit when the page URL is huge', () => {
		const url = reportUrl({ ...ctx, pageUrl: `https://geolang.io/?q=${'é'.repeat(5000)}` });
		expect(url.length).toBeLessThanOrEqual(6000);
		expect(parse(url).params.get('body')).not.toContain('Page:');
	});
});
