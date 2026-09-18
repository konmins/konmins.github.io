const pad = (n: number) => String(n).padStart(2, '0');

/**
 * 统一用 UTC 读取，避免不同时区下日期整体偏移一天
 * （frontmatter 里写 '2026-09-18' 会被解析成 UTC 零点）。
 */
export function toISODate(date: Date): string {
	return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** 2026-09-18 */
export function formatDate(date: Date): string {
	return toISODate(date);
}

/** 2026 年 9 月 18 日 */
export function formatDateCN(date: Date): string {
	return `${date.getUTCFullYear()} 年 ${date.getUTCMonth() + 1} 月 ${date.getUTCDate()} 日`;
}

/** September 2026 之类的英文月份，用于归档分组标题 */
export function getYear(date: Date): string {
	return String(date.getUTCFullYear());
}

/** 相对时间：3 天前 / 2 个月前 / 1 年前 */
export function formatRelative(date: Date, now = new Date()): string {
	const diff = now.getTime() - date.getTime();
	const day = 24 * 60 * 60 * 1000;
	const days = Math.floor(diff / day);

	if (days < 1) return '今天';
	if (days === 1) return '昨天';
	if (days < 30) return `${days} 天前`;
	if (days < 365) return `${Math.floor(days / 30)} 个月前`;
	const years = Math.floor(days / 365);
	return `${years} 年前`;
}
