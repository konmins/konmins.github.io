import type { APIContext } from 'astro';
import { absoluteUrl } from '@/utils/url';

export function GET({ site }: APIContext) {
	const origin = site ?? new URL('https://example.com');
	const sitemap = absoluteUrl('/sitemap-index.xml', origin);

	const body = ['User-agent: *', 'Allow: /', '', `Sitemap: ${sitemap}`, ''].join('\n');

	return new Response(body, {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
}
