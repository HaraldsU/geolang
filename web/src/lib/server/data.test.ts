import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { fileFetch, loadSiteData, readWordLists, slugify } from './data.js';

const FIXTURE = 'e2e/fixtures/data';
let dir: string;
let list: string;

beforeAll(async () => {
	dir = await mkdtemp(join(tmpdir(), 'geolang-words-'));
	list = join(dir, 'words.txt');
	// fixture words (hello, water, dog, bank), one the fixture lacks, and entries that are skipped
	await writeFile(list, '# comment\nhello\nWater\ndog\nbank\nzebra\nx\nblockquote\nhello\n');
});

describe('fileFetch', () => {
	it('serves files under the folder and answers 404 for missing ones', async () => {
		const f = fileFetch(FIXTURE);
		const ok = await f('/data/manifest.json');
		expect(ok.status).toBe(200);
		expect((await ok.json()).version).toBe('vfixture');
		expect((await f('/data/vfixture/index/999.json')).status).toBe(404);
	});
});

describe('slugify', () => {
	it('lowercases and joins words with hyphens', () => {
		expect(slugify('Hello')).toBe('hello');
		expect(slugify(' thank  you ')).toBe('thank-you');
	});
});

describe('readWordLists', () => {
	it('reads lowercase words, skipping comments, duplicates, single letters and exclusions', async () => {
		expect(await readWordLists([list, join(dir, 'missing.txt')])).toEqual([
			'hello',
			'water',
			'dog',
			'bank',
			'zebra'
		]);
	});
});

describe('loadSiteData', () => {
	it('makes a page for each covered word, sorted, with every country', async () => {
		const { manifest, pages } = await loadSiteData(FIXTURE, [list], 0.6);
		expect(manifest?.version).toBe('vfixture');
		// zebra isn't in the fixture
		expect(pages.map((p) => p.slug)).toEqual(['bank', 'dog', 'hello', 'water']);
		const hello = pages.find((p) => p.word === 'hello')!;
		expect(hello.concept.word).toBe('hello');
		expect(hello.rows.length).toBeGreaterThan(200);
		expect(hello.covered).toBeLessThanOrEqual(hello.rows.length);
		const fr = hello.rows.find((r) => r.iso === 'FR')!;
		expect(fr.forms.map((f) => [f.code, f.native])).toEqual([['fr', 'bonjour']]);
		const names = hello.rows.map((r) => r.country);
		expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
	});

	it('lists the other English senses of a word', async () => {
		const { pages } = await loadSiteData(FIXTURE, [list], 0);
		const bank = pages.find((p) => p.word === 'bank')!;
		expect(bank.otherSenses.length).toBeGreaterThan(0);
		expect(bank.otherSenses.length).toBeLessThanOrEqual(5);
	});

	it('drops words below the coverage threshold', async () => {
		const { pages } = await loadSiteData(FIXTURE, [list], 0);
		const all = pages.find((p) => p.word === 'dog')!;
		expect(all.covered).toBe(all.rows.length);
		const hello = pages.find((p) => p.word === 'hello')!;
		expect(hello.covered).toBeLessThan(hello.rows.length);
		// a threshold between hello's coverage and full coverage keeps dog but not hello
		const min = (hello.covered + 0.5) / hello.rows.length;
		const kept = (await loadSiteData(FIXTURE, [list], min)).pages.map((p) => p.word);
		expect(kept).toContain('dog');
		expect(kept).not.toContain('hello');
	});

	it('makes no pages without translation data', async () => {
		expect(await loadSiteData(join(dir, 'nothing'), [list])).toEqual({ manifest: null, pages: [] });
	});
});
