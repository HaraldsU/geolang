// MUST stay in sync with pipeline/geolang/text.py (checked by shared/text-vectors.json).

const WS = /\s+/gu;
const EDGE_PUNCT = /^[\s!?¿¡.,;:'"«»“”„()[\]-]+|[\s!?¿¡.,;:'"«»“”„()[\]-]+$/gu;
const LATIN_DIACRITICS = /[̀-ͯ]/gu;

/** Lookup key: NFC, lower-case, collapse whitespace, trim surrounding punctuation. */
export function norm(s: string): string {
	return s.normalize('NFC').toLowerCase().replace(WS, ' ').replace(EDGE_PUNCT, '');
}

/** Accent-insensitive variant of an already normalised key. */
export function fold(s: string): string {
	return s.normalize('NFD').replace(LATIN_DIACRITICS, '').normalize('NFC');
}

const encoder = new TextEncoder();

/** 32-bit FNV-1a over UTF-8 bytes. */
export function fnv1a(s: string): number {
	let h = 0x811c9dc5;
	for (const b of encoder.encode(s)) {
		h ^= b;
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h >>> 0;
}

export function bucket(key: string, n: number): number {
	return fnv1a(key) % n;
}
