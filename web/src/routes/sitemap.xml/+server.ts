import { buildSitemap, wordPath } from '#lib/seo.js';
import { siteData } from '#lib/server/data.js';
import type { RequestHandler } from './$types';

export const prerender = true;

export const GET: RequestHandler = async () => {
	const { manifest, pages } = await siteData();
	const lastmod = manifest?.built;
	const xml = buildSitemap([
		{ path: '/' },
		{ path: '/about' },
		{ path: '/words', lastmod },
		...pages.map((p) => ({ path: wordPath(p.slug), lastmod }))
	]);
	return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
