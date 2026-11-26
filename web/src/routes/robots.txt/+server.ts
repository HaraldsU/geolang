import { absUrl } from '#lib/seo.js';
import type { RequestHandler } from './$types';

export const prerender = true;

export const GET: RequestHandler = () =>
	new Response(`User-agent: *\nDisallow:\n\nSitemap: ${absUrl('/sitemap.xml')}\n`, {
		headers: { 'content-type': 'text/plain; charset=utf-8' }
	});
