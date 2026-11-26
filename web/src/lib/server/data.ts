/**
 * Build-time access to the translation data, for the prerendered word pages and the sitemap.
 * It reads the same files the browser downloads, through the same lookup code (createLookup with
 * a fetch that reads from disk), so a word page always matches what the map shows.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createLookup, type Concept, type ConceptRef, type Manifest } from '#lib/data/lookup.js';
import { languageForms, type LanguageForm } from '#lib/data/country-labels.js';
import type { Countries, Languages } from '#lib/data/types.js';

/** Translation data folder (manifest.json + v<date>/); E2E builds point it at the fixture data. */
export function dataDir(): string {
	return resolve(process.env.GEOLANG_DATA_DIR ?? 'static/data');
}

/** countries.json and languages.json are in the repository, next to the generated data. */
const META_DIR = 'static/data';

/** English words that get a page: the most frequent words, plus words people often look up. */
export const WORD_LISTS = [
	'../pipeline/wordlists/top-1000-en.txt',
	'src/lib/server/extra-words.txt'
];

/**
 * Share of countries that must have the word for it to get a page. It keeps out thin pages,
 * mostly inflected forms ("taking", "days") whose translations are listed under the base word.
 */
export const MIN_COVERAGE = 0.6;

/** Frequency-list entries that are artefacts of its source (Project Gutenberg) or abbreviations. */
const EXCLUDED = new Set([
	'blockquote',
	'copyright',
	'de',
	'dr',
	'ebook',
	'electronic',
	'ex',
	'gutenberg',
	'la',
	'mr',
	'mrs',
	'per',
	'trademark'
]);

/** A fetch for createLookup that serves files under `dir`; missing files answer 404 like a server. */
export function fileFetch(dir: string): typeof fetch {
	return (async (input: string | URL | Request) => {
		const rel = String(input).replace(/^\/data\//, '');
		try {
			return new Response(await readFile(resolve(dir, rel)), {
				headers: { 'content-type': 'application/json' }
			});
		} catch {
			return new Response('not found', { status: 404 });
		}
	}) as typeof fetch;
}

/** URL slug of a word ("thank you" → "thank-you"). */
export function slugify(word: string): string {
	return word.trim().toLowerCase().replace(/\s+/g, '-');
}

/**
 * Lowercase words (a–z, single spaces, at least two letters) from word-list files. Comments (#),
 * duplicates and EXCLUDED words are skipped, and so are missing files.
 */
export async function readWordLists(files: string[]): Promise<string[]> {
	const words = new Set<string>();
	for (const file of files) {
		let text: string;
		try {
			text = await readFile(resolve(file), 'utf-8');
		} catch {
			continue;
		}
		for (const line of text.split('\n')) {
			const w = line.trim().toLowerCase().replace(/\s+/g, ' ');
			if (/^[a-z]{2,}( [a-z]+)*$/.test(w) && !EXCLUDED.has(w)) words.add(w);
		}
	}
	return [...words];
}

export interface WordRow {
	iso: string;
	country: string;
	forms: LanguageForm[];
}

export interface WordPage {
	slug: string;
	word: string;
	concept: Concept;
	/** the other English senses of the word (e.g. bank: "edge of a river") */
	otherSenses: Pick<ConceptRef, 'pos' | 'gloss'>[];
	/** every country with official languages, by name */
	rows: WordRow[];
	/** countries with at least one translation */
	covered: number;
}

export interface SiteData {
	manifest: Manifest | null;
	pages: WordPage[];
}

const collator = new Intl.Collator('en');

async function readJson<T>(path: string): Promise<T> {
	return JSON.parse(await readFile(path, 'utf-8')) as T;
}

/** Build the word pages from the data in `dir`; no data (a fresh checkout) means no pages. */
export async function loadSiteData(
	dir = dataDir(),
	files = WORD_LISTS,
	minCoverage = MIN_COVERAGE
): Promise<SiteData> {
	const lookup = createLookup('/data', fileFetch(dir));
	const manifest = await lookup.getManifest().catch(() => null);
	if (!manifest?.version) return { manifest: null, pages: [] };

	const [countries, languages] = await Promise.all([
		readJson<Countries>(resolve(META_DIR, 'countries.json')),
		readJson<Languages>(resolve(META_DIR, 'languages.json'))
	]);
	const withLanguages = Object.entries(countries)
		.filter(([, c]) => c.languages.length)
		.sort(([, a], [, b]) => collator.compare(a.name, b.name));

	const pages: WordPage[] = [];
	for (const word of await readWordLists(files)) {
		// senses of the English headword itself, most important first
		const senses = (await lookup.search(word))
			.filter((r) => r.langs.includes('en') && r.word.toLowerCase() === word)
			.sort((a, b) => b.weight - a.weight);
		if (!senses.length) continue;
		const concept = await lookup.getConcept(senses[0].id);
		if (!concept) continue;

		const rows = withLanguages.map(([iso, c]) => ({
			iso,
			country: c.name,
			forms: languageForms(c.languages, languages, concept)
		}));
		const covered = rows.filter((r) => r.forms.some((f) => f.native)).length;
		if (covered < minCoverage * rows.length) continue;

		pages.push({
			slug: slugify(word),
			word,
			concept,
			otherSenses: senses.slice(1, 6).map(({ pos, gloss }) => ({ pos, gloss })),
			rows,
			covered
		});
	}
	pages.sort((a, b) => collator.compare(a.word, b.word));
	return { manifest, pages };
}

let cached: Promise<SiteData> | null = null;

/** loadSiteData() once per build: every prerendered page shares the result. */
export function siteData(): Promise<SiteData> {
	cached ??= loadSiteData();
	return cached;
}
