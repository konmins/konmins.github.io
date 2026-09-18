#!/usr/bin/env node
/**
 * 新建一篇文章的脚手架：npm run new "文章标题"
 *
 * 会做三件事：
 *  1. 把中文/英文标题转成 URL 友好的文件名
 *  2. 按当前时间生成 frontmatter
 *  3. 写入 src/content/blog/
 */
import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const blogDir = join(root, 'src', 'content', 'blog');

const rawTitle = process.argv.slice(2).join(' ').trim();

if (!rawTitle) {
	console.error('用法：npm run new "文章标题"');
	console.error('例如：npm run new "Compose 重组到底什么时候会发生"');
	process.exit(1);
}

/** 生成文件名：保留中英文字符，其余转成连字符 */
function slugify(title) {
	const slug = title
		.trim()
		.toLowerCase()
		.replace(/[\s_]+/g, '-')
		.replace(/[^\p{L}\p{N}-]+/gu, '')
		.replace(/-{2,}/g, '-')
		.replace(/^-+|-+$/g, '');
	return slug || `post-${Date.now()}`;
}

const today = new Date().toISOString().slice(0, 10);
const slug = slugify(rawTitle);
const target = join(blogDir, `${slug}.md`);

const template = `---
title: ${rawTitle}
description: 一句话摘要，会显示在列表页、搜索结果和 RSS 里（建议 60-120 字）
pubDate: ${today}
category: Android
tags: []
draft: true
---

这里开始写正文。

## 二级标题

正文内容。

\`\`\`kotlin title="Example.kt"
// 代码块可以带文件名，会显示在代码块顶部
val greeting = "hello"
\`\`\`
`;

try {
	await access(target);
	console.error(`文件已存在，换个标题或者直接去改：${target}`);
	process.exit(1);
} catch {
	/* 不存在，继续创建 */
}

await mkdir(blogDir, { recursive: true });
await writeFile(target, template, 'utf8');

console.log(`已创建：src/content/blog/${slug}.md`);
console.log('默认是草稿（draft: true），只有 npm run dev 能看到；要发布就把它删掉或改成 false。');
