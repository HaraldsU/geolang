import { error } from '@sveltejs/kit';
import { siteData } from '#lib/server/data.js';
import type { EntryGenerator, PageServerLoad } from './$types';

/** Plain HTML: the page is read, not used, so it needs no JavaScript. */
export const csr = false;

export const entries: EntryGenerator = async () =>
	(await siteData()).pages.map(({ slug }) => ({ slug }));

export const load: PageServerLoad = async ({ params }) => {
	const { pages } = await siteData();
	const i = pages.findIndex((p) => p.slug === params.slug);
	if (i < 0) error(404, 'Not found');
	const { word, concept, otherSenses, rows, covered } = pages[i];
	const neighbour = (j: number) => {
		const p = pages[(j + pages.length) % pages.length];
		return { slug: p.slug, word: p.word };
	};
	return {
		slug: params.slug,
		word,
		concept: { word: concept.word, pos: concept.pos, gloss: concept.gloss },
		otherSenses,
		rows,
		covered,
		prev: neighbour(i - 1),
		next: neighbour(i + 1)
	};
};
