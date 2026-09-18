/**
 * 「项目」页的数据源。
 * 这里是我自己写过的工具和开源项目——包括 Android 的，也包括跑在桌面端、命令行、浏览器里的。
 * 增删条目只改这个文件即可。
 */

export type ProjectStatus = '活跃开发' | '维护中' | '已完成' | '暂停';

export interface Project {
	/** 项目名 */
	name: string;
	/** 平台，用于筛选按钮和角标 */
	platform: 'Android' | '桌面端' | '命令行' | 'Web' | '浏览器扩展' | '其他';
	/** 一句话说明，列表卡片上显示 */
	summary: string;
	/** 详细介绍，可省略 */
	description?: string;
	/** 技术栈标签 */
	stack: string[];
	/** 年份 */
	year: string;
	status: ProjectStatus;
	/** 是否置顶展示 */
	featured?: boolean;
	/** 相关链接 */
	links?: { label: string; url: string }[];
}

export const PROJECTS: Project[] = [
	{
		name: 'LogPeek',
		platform: 'Android',
		summary: '把 logcat 变成能按业务维度过滤的实时面板，支持正则高亮与崩溃聚类。',
		description:
			'平时排查线上问题最烦的就是日志刷屏。这个 App 通过 Shizuku 直接读取 logcat，按包名/进程/正则分流，把崩溃堆栈自动折叠归类，支持长按复制和导出。UI 全部用 Compose 写，列表用 LazyColumn + 分页加载，10 万行日志滚动不掉帧。',
		stack: ['Kotlin', 'Jetpack Compose', 'Shizuku', 'Coroutines', 'Room'],
		year: '2025',
		status: '维护中',
		featured: true,
		links: [
			{ label: 'GitHub', url: 'https://github.com/konmins/logpeek' },
		],
	},
	{
		name: 'adb-toolkit',
		platform: '命令行',
		summary: '一组 adb 快捷命令：批量装包、抓取堆栈、清理应用数据、一键录屏。',
		description:
			'用 Kotlin 写的 CLI（GraalVM native-image 打包，单文件无依赖）。最常用的是 `adt crash -p com.example.app`，直接把最近一次崩溃的堆栈拉出来并高亮关键帧，省掉一堆 grep。',
		stack: ['Kotlin', 'Clikt', 'GraalVM', 'Kotlin Script'],
		year: '2025',
		status: '活跃开发',
		featured: true,
		links: [
			{ label: 'GitHub', url: 'https://github.com/konmins/adb-toolkit' },
		],
	},
	{
		name: 'AssetBox',
		platform: '桌面端',
		summary: '跨平台资源打包工具：把设计给的图批量转 WebP / AVIF，并生成 Android 多密度目录。',
		description:
			'设计稿导出的图往往体积巨大、尺寸也不符合 Android 的多密度规范。这个工具支持拖拽批量处理、按 mdpi~xxxhdpi 自动切图、生成 drawable 目录结构，底层用 Rust 的 image 库做编码，比脚本快很多。',
		stack: ['Rust', 'Tauri', 'image-rs'],
		year: '2024',
		status: '维护中',
		featured: true,
		links: [
			{ label: 'GitHub', url: 'https://github.com/konmins/assetbox' },
			{ label: '下载', url: 'https://github.com/konmins/assetbox/releases' },
		],
	},
	{
		name: 'JSON → Kotlin',
		platform: 'Web',
		summary: '粘贴 JSON 直接生成带 @Serializable 注解的 Kotlin 数据类，支持嵌套与可空推断。',
		description:
			'纯前端实现（没有任何请求发出，数据不会离开浏览器）。支持生成 kotlinx.serialization / Moshi / Gson 三种风格，能识别命名风格并自动做 camelCase 转换。',
		stack: ['TypeScript', 'Astro', 'WebAssembly'],
		year: '2024',
		status: '已完成',
		links: [
			{ label: '在线使用', url: 'https://konmins.github.io/json2kotlin/' },
		],
	},
	{
		name: 'Detekt Rule Pack',
		platform: 'Android',
		summary: '一套针对 Compose 的静态检查规则，能在 CI 阶段拦住常见的重组与状态误用。',
		description:
			'比如「在 Composable 里直接 new 对象导致每次重组都重新分配」「把 Modifier 作为参数传递时没有使用默认值」这类问题，靠 code review 很难全抓，写成 Detekt 规则后交给 CI。',
		stack: ['Kotlin', 'Detekt', 'PSI'],
		year: '2023',
		status: '维护中',
		links: [
			{ label: 'GitHub', url: 'https://github.com/konmins/detekt-compose-rules' },
		],
	},
	{
		name: '这个博客',
		platform: 'Web',
		summary: '用 Astro 搭的静态博客，部署在 GitHub Pages，写文章只需要提交一个 Markdown。',
		stack: ['Astro', 'TypeScript', 'GitHub Actions'],
		year: '2026',
		status: '维护中',
		links: [
			{ label: '源码', url: 'https://github.com/konmins/konmins.github.io' },
		],
	},
];

/** 按平台聚合，供筛选按钮使用 */
export function getPlatforms(): string[] {
	return [...new Set(PROJECTS.map((p) => p.platform))].sort((a, b) => a.localeCompare(b, 'zh'));
}
