import { describe, expect, it, vi } from 'vitest';
import { createLookup, LookupError } from './lookup.js';
import { bucket, norm } from './text.js';

const manifest = { version: 'v1', indexShards: 4, conceptShards: 2, concepts: 2 };

function fakeData() {
	const files: Record<string, unknown> = { '/data/manifest.json': manifest };
	const add = (kind: string, n: number, key: string, value: unknown) => {
		const url = `/data/v1/${kind}/${bucket(key, n)}.json`;
		files[url] = { ...((files[url] as object) ?? {}), [key]: value };
	};
	const hello = ['a1', 'hello', 'intj', 'greeting', 3];
	add('index', 4, 'hello', [hello]);
	add('index', 4, 'привет', [hello]);
	add('index', 4, 'café', [['c3', 'cafe', 'noun', 'coffee shop', 2]]);
	add('index', 4, 'cafe', [['c3', 'cafe', 'noun', 'coffee shop', 2]]);
	add('index', 4, 'naive', [['n1', 'naive', 'adj', 'innocent', 2]]);
	add('concepts', 2, 'a1', {
		w: 'hello',
		p: 'intj',
		g: 'greeting',
		t: { fr: ['bonjour', null], ru: ['привет', 'privet'] }
	});
	return files;
}

function fakeFetch(files: Record<string, unknown>) {
	return vi.fn(async (url: string | URL | Request) => {
		const body = files[String(url)];
		return body === undefined
			? new Response('not found', { status: 404 })
			: new Response(JSON.stringify(body), { status: 200 });
	}) as unknown as typeof fetch;
}

describe('lookup', () => {
	it('finds a concept by any language and loads its translations', async () => {
		const lk = createLookup('/data', fakeFetch(fakeData()));
		const refs = await lk.search('Привет');
		expect(refs).toEqual([{ id: 'a1', word: 'hello', pos: 'intj', gloss: 'greeting', weight: 3 }]);
		const c = await lk.getConcept('a1');
		expect(c?.translations.ru).toEqual(['привет', 'privet']);
		expect(c?.translations.fr).toEqual(['bonjour', null]);
	});

	it('falls back to accent-folded keys', async () => {
		const lk = createLookup('/data', fakeFetch(fakeData()));
		expect((await lk.search('naïve')).map((r) => r.id)).toEqual(['n1']);
	});

	it('returns empty results for unknown or blank words', async () => {
		const lk = createLookup('/data', fakeFetch(fakeData()));
		expect(await lk.search('qwertyzzz')).toEqual([]);
		expect(await lk.search('   ')).toEqual([]);
		expect(await lk.getConcept('nope')).toBeNull();
	});

	it('caches shards and the manifest', async () => {
		const f = fakeFetch(fakeData());
		const lk = createLookup('/data', f);
		await lk.search('hello');
		await lk.search('hello');
		const calls = (f as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => c[0]);
		expect(calls.filter((u) => u === '/data/manifest.json')).toHaveLength(1);
		expect(calls).toContain(`/data/v1/index/${bucket(norm('hello'), 4)}.json`);
		expect(new Set(calls).size).toBe(calls.length);
	});

	it('raises a typed network error and can retry', async () => {
		let fail = true;
		const files = fakeData();
		const f = vi.fn(async (url: string | URL | Request) => {
			if (fail) throw new TypeError('Failed to fetch');
			return new Response(JSON.stringify(files[String(url)] ?? {}), { status: 200 });
		}) as unknown as typeof fetch;
		const lk = createLookup('/data', f);
		await expect(lk.search('hello')).rejects.toBeInstanceOf(LookupError);
		await expect(lk.search('hello')).rejects.toMatchObject({ kind: 'network' });
		fail = false;
		expect(await lk.search('hello')).toHaveLength(1);
	});

	it('raises on server errors', async () => {
		const f = vi.fn(async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
		await expect(createLookup('/data', f).search('hello')).rejects.toMatchObject({
			kind: 'network'
		});
	});
});
