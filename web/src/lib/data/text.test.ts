import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fnv1a, fold, norm, bucket } from './text.js';

const vectors: {
	input: string;
	norm: string;
	fold: string;
	fnv1a: number;
	bucket1024: number;
}[] = JSON.parse(
	readFileSync(
		fileURLToPath(new URL('../../../../shared/text-vectors.json', import.meta.url)),
		'utf-8'
	)
).vectors;

describe('shared vectors (must match the Python pipeline)', () => {
	it.each(vectors.map((v) => [v.input || '<empty>', v] as const))('%s', (_, v) => {
		const n = norm(v.input);
		expect(n).toBe(v.norm);
		expect(fold(n)).toBe(v.fold);
		expect(fnv1a(n)).toBe(v.fnv1a);
		expect(bucket(n, 1024)).toBe(v.bucket1024);
	});
});

describe('normalisation', () => {
	it('lower-cases across scripts', () => {
		expect(norm('Привет')).toBe('привет');
		expect(norm('HELLO')).toBe('hello');
	});
	it('folds accents only on request', () => {
		expect(norm('Ça')).toBe('ça');
		expect(fold(norm('Ça'))).toBe('ca');
		expect(fold('приве́т')).toBe('привет');
	});
	it('keeps non-Latin vowel signs intact when folding', () => {
		expect(fold('नमस्ते')).toBe('नमस्ते');
	});
	it('trims punctuation and whitespace', () => {
		expect(norm('  ¿Hola?  ')).toBe('hola');
		expect(norm('good   morning')).toBe('good morning');
	});
});
