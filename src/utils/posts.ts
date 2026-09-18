import { getCollection, type CollectionEntry } from 'astro:content';
import { CATEGORY_META } from '@/consts';
import { withBase } from './url';

export type Post = CollectionEntry<'blog'>;

export interface Term {
	/** 原始名称，如「性能优化」 */
	name: string;
	/** URL 片段 */
	slug: string;
	/** 该分类/标签下的文章数 */
	count: number;
}

/** 按发布时间倒序取出全部文章（生产环境自动过滤草稿） */
export async function getPosts(): Promise<Post[]> {
	const posts = await getCollection('blog', ({ data }) =>
		import.meta.env.PROD ? !data.draft : true,
	);
	return sortByDate(posts);
}

export function sortByDate(posts: Post[]): Post[] {
	return [...posts].sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export function postPath(post: Post): string {
	return `/blog/${post.id}/`;
}

export function postHref(post: Post): string {
	return withBase(postPath(post));
}

/** 把任意字符串转成 URL 片段。中文会保留，空格/下划线转连字符。 */
export function slugify(input: string): string {
	const slug = input
		.trim()
		.toLowerCase()
		.replace(/[\s_]+/g, '-')
		.replace(/[^\p{L}\p{N}-]+/gu, '')
		.replace(/-{2,}/g, '-')
		.replace(/^-+|-+$/g, '');
	return slug || encodeURIComponent(input.trim());
}

export function categorySlug(name: string): string {
	return CATEGORY_META[name]?.slug ?? slugify(name);
}

export function tagSlug(name: string): string {
	return slugify(name);
}

export function categoryHref(name: string): string {
	return withBase(`/categories/${categorySlug(name)}/`);
}

export function tagHref(name: string): string {
	return withBase(`/tags/${tagSlug(name)}/`);
}

/**
 * 粗略估算阅读时长。
 * 中文按 400 字/分钟、英文按 220 词/分钟，并剔除代码块（读代码比读正文慢，另算 0.35 系数）。
 */
export function readingMinutes(post: Post): number {
	const raw = post.body ?? '';
	const codeBlocks = raw.match(/```[\s\S]*?```/g) ?? [];
	const codeLength = codeBlocks.reduce((sum, block) => sum + block.length, 0);
	const text = raw.replace(/```[\s\S]*?```/g, '');

	const cjk = (text.match(/[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) ?? []).length;
	const words = (text.match(/[A-Za-z0-9_'’-]+/g) ?? []).length;

	const minutes = cjk / 400 + words / 220 + codeLength / 1400;
	return Math.max(1, Math.round(minutes));
}

/** 聚合分类 */
export function collectCategories(posts: Post[]): Term[] {
	const map = new Map<string, Term>();
	for (const post of posts) {
		const name = post.data.category;
		const slug = categorySlug(name);
		const existing = map.get(slug);
		if (existing) existing.count += 1;
		else map.set(slug, { name, slug, count: 1 });
	}
	return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh'));
}

/** 聚合标签 */
export function collectTags(posts: Post[]): Term[] {
	const map = new Map<string, Term>();
	for (const post of posts) {
		for (const name of post.data.tags) {
			const slug = tagSlug(name);
			const existing = map.get(slug);
			if (existing) existing.count += 1;
			else map.set(slug, { name, slug, count: 1 });
		}
	}
	return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh'));
}

/** 按年份分组，用于归档页 */
export function groupByYear(posts: Post[]): { year: string; posts: Post[] }[] {
	const map = new Map<string, Post[]>();
	for (const post of posts) {
		const year = String(post.data.pubDate.getUTCFullYear());
		const list = map.get(year);
		if (list) list.push(post);
		else map.set(year, [post]);
	}
	return [...map.entries()]
		.map(([year, list]) => ({ year, posts: sortByDate(list) }))
		.sort((a, b) => Number(b.year) - Number(a.year));
}

/** 上一篇 / 下一篇（按时间线，不是数组下标） */
export function getNeighbors(posts: Post[], current: Post): { prev?: Post; next?: Post } {
	const index = posts.findIndex((p) => p.id === current.id);
	if (index === -1) return {};
	// 列表是倒序的：index-1 更新，index+1 更旧
	return { prev: posts[index + 1], next: posts[index - 1] };
}

/** 同系列文章，按时间正序 */
export function getSeriesPosts(posts: Post[], post: Post): Post[] {
	if (!post.data.series) return [];
	return posts
		.filter((p) => p.data.series === post.data.series)
		.sort((a, b) => a.data.pubDate.valueOf() - b.data.pubDate.valueOf());
}

/** 相关文章：优先同分类，其次标签重合度高 */
export function getRelatedPosts(posts: Post[], current: Post, limit = 3): Post[] {
	const tags = new Set(current.data.tags);
	return posts
		.filter((p) => p.id !== current.id)
		.map((p) => {
			let score = p.data.tags.filter((t) => tags.has(t)).length * 2;
			if (p.data.category === current.data.category) score += 3;
			if (p.data.series && p.data.series === current.data.series) score += 5;
			return { post: p, score };
		})
		.filter((item) => item.score > 0)
		.sort((a, b) => b.score - a.score || b.post.data.pubDate.valueOf() - a.post.data.pubDate.valueOf())
		.slice(0, limit)
		.map((item) => item.post);
}

/** 数组分页 */
export function paginate<T>(items: T[], pageSize: number): T[][] {
	const pages: T[][] = [];
	for (let i = 0; i < items.length; i += pageSize) {
		pages.push(items.slice(i, i + pageSize));
	}
	return pages.length ? pages : [[]];
}
