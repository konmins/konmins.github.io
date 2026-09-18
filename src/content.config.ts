import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
// Astro 7 起从 'astro:content' 导出的 z 已标记废弃，官方推荐用 astro/zod
import { z } from 'astro/zod';

/**
 * 博客文章集合。
 *
 * 文件放在 src/content/blog/ 下，支持 .md 和 .mdx。
 * 文件名（去掉扩展名）就是文章 URL：`android-coroutines.md` → `/blog/android-coroutines/`
 */
const blog = defineCollection({
	loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
	schema: z.object({
		/** 标题 */
		title: z.string().max(80),

		/** 摘要，用于列表页、SEO description、RSS */
		description: z.string().max(200),

		/** 发布日期。写成 'YYYY-MM-DD' 即可 */
		pubDate: z.coerce.date(),

		/** 最后更新时间，可省略 */
		updatedDate: z.coerce.date().optional(),

		/** 分类，单选。建议用 CATEGORY_META 里登记过的名字 */
		category: z.string(),

		/** 标签，可多个 */
		tags: z.array(z.string()).default([]),

		/** 草稿：为 true 时只在 `npm run dev` 可见，不会被构建进线上 */
		draft: z.boolean().default(false),

		/** 精选：为 true 时在首页「精选文章」区块展示 */
		featured: z.boolean().default(false),

		/** 所属系列，同系列文章会在详情页互相串联 */
		series: z.string().optional(),

		/** 封面图，可选。放 src/assets/covers/ 下并写相对路径 */
		// cover: z.string().optional(),
	}),
});

export const collections = { blog };
