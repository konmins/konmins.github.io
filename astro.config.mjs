// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import {
	transformerMetaHighlight,
	transformerNotationDiff,
	transformerNotationErrorLevel,
	transformerNotationFocus,
	transformerNotationHighlight,
	transformerNotationWordHighlight,
} from '@shikijs/transformers';
import baseLinks from './integrations/base-links.mjs';

/**
 * ─────────────────────────────────────────────────────────────
 *  这两个值是部署到 GitHub Pages 的关键，务必按实际情况修改：
 *
 *  1. 仓库名形如 `你的用户名.github.io`
 *     → SITE_URL = 'https://你的用户名.github.io'，BASE_PATH = '/'
 *  2. 仓库名是别的（例如 githubBlog）
 *     → SITE_URL = 'https://你的用户名.github.io'，BASE_PATH = '/githubBlog/'
 *  3. 绑定了自定义域名（例如 blog.example.com）
 *     → SITE_URL = 'https://blog.example.com'，BASE_PATH = '/'
 *
 *  你**不需要**为了部署去手改这里：GitHub Actions 会在构建时
 *  自动注入 SITE_URL / BASE_PATH 两个环境变量（见 .github/workflows/deploy.yml）。
 *  这里的默认值只用于本地开发预览。
 * ─────────────────────────────────────────────────────────────
 */
const SITE_URL = process.env.SITE_URL ?? 'https://konmins.github.io';
/**
 * 仓库名是 konmins.github.io（用户页仓库），站点部署在根路径。
 * 如果你的仓库是别的名字（例如 githubBlog），这里要改成 '/<仓库名>/'。
 * 线上构建不用管这里 —— GitHub Actions 会用 configure-pages 自动填。
 */
const BASE_PATH = process.env.BASE_PATH ?? '/';

/** 把代码块 meta 里的 `title="MainActivity.kt"` 变成代码块顶部的文件名标签 */
function transformerCodeTitle() {
	return {
		name: 'code-title',
		pre(/** @type {any} */ node) {
			const raw = this.options.meta?.__raw ?? '';
			const match = raw.match(/(?:title|file|filename)=(?:"([^"]+)"|'([^']+)'|(\S+))/);
			const title = match?.[1] ?? match?.[2] ?? match?.[3];
			if (title) node.properties['data-code-title'] = title;
		},
	};
}

export default defineConfig({
	site: SITE_URL,
	base: BASE_PATH,

	/*
	 * 明确绑到 IPv4 回环，不要用默认值。
	 *
	 * Astro 默认 host 是 'localhost'，在部分 Windows 机器上会被解析成 IPv6 的 ::1，
	 * 结果服务器只监听 ::1；如果系统禁用了 IPv6 回环，浏览器就会「无法访问」。
	 * 写死 127.0.0.1 可以绕开这个问题，本机访问 http://localhost:4321 也依然有效。
	 *
	 * 想在手机上调试时，用命令行覆盖即可：npm run dev -- --host 0.0.0.0
	 */
	server: { host: '127.0.0.1', port: 4321 },
	preview: { host: '127.0.0.1', port: 4321 },

	// v7 默认的 'jsx' 会按 JSX 规则吞掉行内元素之间的空格，这里保留 v6 的 HTML 感知压缩
	compressHTML: true,

	// 鼠标悬停/进入视口时预取页面，站内跳转几乎瞬开
	prefetch: { prefetchAll: true, defaultStrategy: 'viewport' },

	// baseLinks 负责给 Markdown 正文里手写的根路径链接补上部署子路径，
	// 说明见 integrations/base-links.mjs
	integrations: [mdx(), sitemap(), baseLinks()],

	markdown: {
		// 同时输出亮/暗两套主题，由 CSS 按 data-theme 切换（见 global.css）
		shikiConfig: {
			themes: { light: 'github-light', dark: 'github-dark-dimmed' },
			defaultColor: false,
			wrap: true,
			transformers: [
				transformerCodeTitle(),
				transformerNotationHighlight(),
				transformerNotationWordHighlight(),
				transformerNotationDiff(),
				transformerNotationFocus(),
				transformerNotationErrorLevel(),
				transformerMetaHighlight(),
			],
		},
	},
});
