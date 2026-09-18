/**
 * 站点部署在子路径（如 GitHub Pages 的 /githubBlog/）时，
 * 所有站内链接都必须经过 withBase 处理，否则会 404。
 */
export function withBase(path = '/'): string {
	const base = import.meta.env.BASE_URL || '/';
	// BASE_URL 形如 '/' 或 '/githubBlog/'
	const prefix = base.endsWith('/') ? base.slice(0, -1) : base;
	let p = path.startsWith('/') ? path : `/${path}`;
	if (p === '/') return prefix ? `${prefix}/` : '/';
	return `${prefix}${p}`;
}

/** 生成站点绝对地址，用于 canonical、OG、RSS */
export function absoluteUrl(path = '/', site: URL | string): string {
	const origin = site instanceof URL ? site.origin : new URL(site).origin;
	return new URL(withBase(path), origin).href;
}

/** 去掉末尾斜杠，用于导航栏高亮判断 */
export function normalizePath(pathname: string): string {
	const trimmed = pathname.replace(/\/+$/, '');
	return trimmed === '' ? '/' : trimmed;
}
