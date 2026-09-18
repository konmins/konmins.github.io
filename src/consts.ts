/**
 * 站点全局配置。
 *
 * ★ 首次使用请按顺序修改下面的 SITE、SOCIALS、GISCUS 三处。
 *   其他内容（分类、导航）可以直接用，也可以按需增删。
 */

export const SITE = {
	/** 站点标题。会出现在浏览器标签页、页头 Logo、RSS 标题里 */
	title: "Konmin's Notes",

	/** 作者名。出现在页头、页脚、文章作者栏、版权信息里 */
	author: 'Konmin',

	/** 一句话签名，显示在首页大标题下方 */
	tagline: 'Android 应用开发工程师 · 偶尔写点其他小工具',

	/** 首页副标题的补充说明 */
	heroDescription:
		'这里记录 Android / Kotlin / Compose 的实践笔记，也放一些自己写的小工具——包括那些跑在桌面端、命令行和浏览器里的非 Android 项目。',

	/** 站点描述。用于 SEO description、RSS 描述 */
	description:
		'一个 Android 开发者的技术博客：Kotlin、Jetpack Compose、Android 性能优化，以及跨平台小工具的折腾记录。',

	/** 语言标签，写入 <html lang> */
	lang: 'zh-CN',

	/**
	 * 默认分享图（放在 public/ 下，1200x630 最佳）。
	 * 想换成自己的，替换 public/og-default.png 即可；
	 * public/og-default.svg 是同一张图的矢量模板，方便改配色和文字。
	 */
	ogImage: '/og-default.png',
} as const;

/** 每页文章数（列表页与首页分页共用） */
export const POSTS_PER_PAGE = 8;

/** 顶栏导航 */
export const NAV = [
	{ label: '首页', href: '/' },
	{ label: '文章', href: '/blog/' },
	{ label: '分类', href: '/categories/' },
	{ label: '标签', href: '/tags/' },
	{ label: '项目', href: '/projects/' },
	{ label: '关于', href: '/about/' },
] as const;

export type IconName =
	| 'github'
	| 'mail'
	| 'rss'
	| 'search'
	| 'sun'
	| 'moon'
	| 'clock'
	| 'calendar'
	| 'arrow-left'
	| 'arrow-right'
	| 'chevron-up'
	| 'chevron-right'
	| 'external'
	| 'link'
	| 'menu'
	| 'close'
	| 'archive';

export interface SocialLink {
	name: string;
	url: string;
	icon: IconName;
}

/** 社交链接。icon 只能取 IconName 里的值 */
export const SOCIALS: SocialLink[] = [
	{ name: 'GitHub', url: 'https://github.com/konmins', icon: 'github' },
	{ name: '邮箱', url: 'mailto:konmin1989@qq.com', icon: 'mail' },
	{ name: 'RSS', url: '/rss.xml', icon: 'rss' },
];

/**
 * 分类元信息（可选）。
 *
 * 分类本身来自文章 frontmatter 的 `category` 字段，这里只是给已知分类
 * 补一段描述和固定 URL。写了新分类但忘了在这里登记也没关系，
 * slug 会自动降级为由分类名生成。
 */
export const CATEGORY_META: Record<
	string,
	{ slug: string; description: string; accent: string }
> = {
	Android: {
		slug: 'android',
		description: 'Android 平台开发、系统机制与最佳实践',
		accent: '#3ddc84',
	},
	Kotlin: {
		slug: 'kotlin',
		description: 'Kotlin 语言特性、协程与多平台开发',
		accent: '#7f52ff',
	},
	Compose: {
		slug: 'compose',
		description: 'Jetpack Compose 声明式 UI、状态管理与性能',
		accent: '#4285f4',
	},
	工具: {
		slug: 'tools',
		description: '自研工具、脚本，以及提高效率的折腾记录',
		accent: '#f59e0b',
	},
	工程实践: {
		slug: 'engineering',
		description: '架构设计、构建、测试与发布流程',
		accent: '#0ea5e9',
	},
	随笔: {
		slug: 'essay',
		description: '思考、总结与碎碎念',
		accent: '#ec4899',
	},
};

/**
 * Giscus 评论（基于 GitHub Discussions，免费、无后端）。
 *
 * 不配置就自动隐藏评论区，不会报错。开启步骤见 README「开启评论」一节。
 */
export const GISCUS = {
	enabled: false,
	repo: 'your-username/your-repo',
	repoId: '',
	category: 'Announcements',
	categoryId: '',
	/** 'light' | 'dark' | 'preferred_color_scheme' */
	theme: 'preferred_color_scheme',
};
