import type { LanguageForm } from './country-labels.js';

/** Where translation mistakes are reported (GitHub issues: reporters use their own account). */
export const REPORT_REPO = 'https://github.com/HaraldsU/geolang';

export interface ReportContext {
	/** the concept (headword, part of speech, sense) whose translations are shown */
	concept: { word: string; pos: string; gloss: string };
	country: { iso: string; name: string };
	forms: LanguageForm[];
	/** link back to the exact view (search, sense, script) */
	pageUrl?: string;
}

/** GitHub rejects very long URLs (about 8 KB); stay well below that. */
const MAX_URL_LENGTH = 6000;
const MAX_FORMS_WHEN_LONG = 10;

function shown(f: LanguageForm): string {
	if (!f.native) return 'N/A';
	return f.latin && f.latin !== f.native ? `${f.native} (${f.latin})` : f.native;
}

/** URL of a new, pre-filled GitHub issue reporting a translation mistake. */
export function reportUrl(ctx: ReportContext): string {
	const full = buildUrl(ctx);
	if (full.length <= MAX_URL_LENGTH) return full;
	// Typically a very long search text in pageUrl: drop it, then trim the form list.
	const lean = { ...ctx, pageUrl: undefined };
	const noPage = buildUrl(lean);
	if (noPage.length <= MAX_URL_LENGTH) return noPage;
	return buildUrl({ ...lean, forms: ctx.forms.slice(0, MAX_FORMS_WHEN_LONG) });
}

function buildUrl({ concept, country, forms, pageUrl }: ReportContext): string {
	const title = `Translation: "${concept.word}" (${concept.gloss}) in ${country.name}`;
	const wiktionary = `https://en.wiktionary.org/wiki/${encodeURIComponent(concept.word.replaceAll(' ', '_'))}#Translations`;
	const body = [
		`**Word:** ${concept.word} (${concept.pos}): ${concept.gloss}`,
		`**Country:** ${country.name} (${country.iso})`,
		'',
		'**Shown translations:**',
		...forms.map((f) => `- ${f.name} (\`${f.code}\`): ${shown(f)}`),
		'',
		'**What is wrong:**',
		'',
		'',
		'**Correct translation:**',
		'',
		'',
		'**Source for the correct translation (required):**',
		'<!-- Link to a reliable reference that shows this translation, e.g. a published dictionary, a',
		'     national language authority, or a Wiktionary entry in that language. Reports without a',
		'     verifiable source cannot be accepted. -->',
		'',
		'',
		'---',
		`Source entry: ${wiktionary}`,
		...(pageUrl ? [`Page: ${pageUrl}`] : [])
	].join('\n');
	const params = new URLSearchParams({ title, body, labels: 'translation' });
	return `${REPORT_REPO}/issues/new?${params}`;
}
