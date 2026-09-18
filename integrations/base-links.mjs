import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 给 HTML 里根路径开头的 href / src 补上部署子路径。
 *
 * 为什么需要它：
 * Astro 的 `base` 配置只会作用到组件里用 withBase() 生成的链接和构建出来的资源路径，
 * **Markdown 正文里手写的 `[关于](/about/)` 不会被改写**。
 * 如果博客部署在 https://<用户名>.github.io/<仓库名>/ 下，这类链接就会 404。
 *
 * 这个集成在构建结束后扫一遍产物里的 .html，把 `href="/xxx"` / `src="/xxx"`
 * 统一加上 base 前缀。已经在 base 下的路径会跳过，不会重复加。
 *
 * 部署在根路径（base 为 '/'）时整个环节自动跳过，不留痕迹。
 */
export default function baseLinks() {
	/** @type {string} */
	let base = '/';

	return {
		name: 'base-links',
		hooks: {
			'astro:config:done': ({ config }) => {
				base = config.base ?? '/';
			},

			'astro:build:done': async ({ dir, logger }) => {
				const prefix = base.replace(/\/+$/, '');
				// 根路径部署，没什么可改的
				if (!prefix) return;

				const root = fileURLToPath(dir);
				const files = await collectHtmlFiles(root);

				let touched = 0;
				let replaced = 0;

				for (const file of files) {
					const html = await readFile(file, 'utf8');
					let count = 0;

					const next = html.replace(
						/(\s(?:href|src))="(\/(?!\/)[^"]*)"/g,
						(match, attr, value) => {
							// 已经带前缀的（含 Astro 自己生成的资源路径）原样保留
							if (value === prefix || value.startsWith(`${prefix}/`)) return match;
							count += 1;
							return `${attr}="${prefix}${value}"`;
						},
					);

					if (count > 0) {
						await writeFile(file, next, 'utf8');
						touched += 1;
						replaced += count;
					}
				}

				if (replaced > 0) {
					logger.info(
						`已为 ${touched} 个页面中的 ${replaced} 个根路径链接补上前缀 ${prefix}/`,
					);
				}
			},
		},
	};
}

/** 递归收集目录下所有 .html 文件 */
async function collectHtmlFiles(dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectHtmlFiles(full)));
		} else if (entry.name.endsWith('.html')) {
			files.push(full);
		}
	}

	return files;
}
