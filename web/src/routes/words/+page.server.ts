import { siteData } from '#lib/server/data.js';
import type { PageServerLoad } from './$types';

export const csr = false;

export const load: PageServerLoad = async () => ({
	words: (await siteData()).pages.map(({ slug, word }) => ({ slug, word }))
});
