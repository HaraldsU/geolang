import { bucket, fold, norm } from './text.js';
import type { FallbackFont } from '#lib/fonts.js';

export interface Manifest {
	version: string;
	indexShards: number;
	conceptShards: number;
	concepts: number;
	source?: string;
	built?: string;
	/** fonts for rare Han characters, built by the pipeline's `fonts` step */
	fallbackFonts?: FallbackFont[];
}

/** One search hit: a sense-level concept the query word belongs to. */
export interface ConceptRef {
	id: string;
	word: string;
	pos: string;
	gloss: string;
	weight: number;
}

export interface Concept {
	id: string;
	word: string;
	pos: string;
	gloss: string;
	/** language code -> [native, latin]; latin is null when the language is written in Latin script */
	translations: Record<string, [string, string | null]>;
}

export class LookupError extends Error {
	constructor(
		message: string,
		readonly kind: 'network' | 'data'
	) {
		super(message);
		this.name = 'LookupError';
	}
}

type Fetch = typeof fetch;
type RawRef = [string, string, string, string, number];
type RawConcept = { w: string; p: string; g: string; t: Record<string, [string, string | null]> };

export const MAX_QUERY_LENGTH = 60;

export function createLookup(base = '/data', fetchImpl: Fetch = (...a) => fetch(...a)) {
	let manifest: Promise<Manifest> | null = null;
	const cache = new Map<string, Promise<Record<string, unknown>>>();

	async function getJson<T>(url: string): Promise<T> {
		let res: Response;
		try {
			res = await fetchImpl(url);
		} catch (e) {
			throw new LookupError(`Could not reach ${url}: ${(e as Error).message}`, 'network');
		}
		if (res.status === 404) return {} as T;
		if (!res.ok) throw new LookupError(`HTTP ${res.status} for ${url}`, 'network');
		try {
			return (await res.json()) as T;
		} catch {
			throw new LookupError(`Invalid JSON in ${url}`, 'data');
		}
	}

	function shard(url: string) {
		let p = cache.get(url);
		if (!p) {
			p = getJson<Record<string, unknown>>(url);
			cache.set(url, p);
			p.catch(() => cache.delete(url)); // allow retry after failures
		}
		return p;
	}

	function getManifest() {
		if (!manifest) {
			manifest = getJson<Manifest>(`${base}/manifest.json`);
			manifest.catch(() => (manifest = null));
		}
		return manifest;
	}

	async function findKey(key: string): Promise<ConceptRef[]> {
		const m = await getManifest();
		if (!m.version) throw new LookupError('Missing data manifest', 'data');
		const data = await shard(`${base}/${m.version}/index/${bucket(key, m.indexShards)}.json`);
		const raw = (data[key] as RawRef[] | undefined) ?? [];
		return raw.map(([id, word, pos, gloss, weight]) => ({ id, word, pos, gloss, weight }));
	}

	/** Concepts matching a query in any language/script; exact form first, then accent-folded. */
	async function search(query: string): Promise<ConceptRef[]> {
		const key = norm(query.slice(0, MAX_QUERY_LENGTH));
		if (!key) return [];
		const exact = await findKey(key);
		if (exact.length) return exact;
		const folded = fold(key);
		return folded !== key ? findKey(folded) : [];
	}

	async function getConcept(id: string): Promise<Concept | null> {
		const m = await getManifest();
		const data = await shard(`${base}/${m.version}/concepts/${bucket(id, m.conceptShards)}.json`);
		const c = data[id] as RawConcept | undefined;
		return c ? { id, word: c.w, pos: c.p, gloss: c.g, translations: c.t } : null;
	}

	return { search, getConcept, getManifest };
}

export type Lookup = ReturnType<typeof createLookup>;
