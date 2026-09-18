import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { SITE } from '@/consts';
import { getPosts, postPath } from '@/utils/posts';
import { withBase } from '@/utils/url';

export async function GET(context: APIContext) {
	const posts = await getPosts();
	const site = context.site ?? new URL('https://example.com');

	return rss({
		title: SITE.title,
		description: SITE.description,
		// site 只带域名，正文里的 / 开头路径要自己加上部署子路径
		site,
		items: posts.map((post) => ({
			title: post.data.title,
			description: post.data.description,
			pubDate: post.data.pubDate,
			link: withBase(postPath(post)),
			// 去重：分类名有时也出现在 tags 里
			categories: [...new Set([post.data.category, ...post.data.tags])],
			author: SITE.author,
		})),
		customData: `<language>${SITE.lang.toLowerCase()}</language>`,
	});
}
