# 技术博客

一个用 **Astro** 搭的静态技术博客，部署在 **GitHub Pages**。写文章只需要新增一个 Markdown 文件，`git push` 之后自动构建发布。

主要面向 Android / Kotlin / Compose 方向的写作，也适合放一些跨平台小工具的记录。

## 特性

- **几乎零客户端 JS** —— 整站 JS 只有 2KB 出头（目录高亮 + 主题切换 + 搜索）
- **深色模式** —— 跟随系统，可手动切换，无闪烁（主题在样式加载前就写入 `<html>`）
- **Markdown 增强** —— 代码块文件名、行高亮、增删标记、折叠焦点、表格、脚注、锚点链接
- **代码高亮** —— Shiki 双主题，切换深色模式时代码配色同步变化
- **内容体系** —— 分类 / 标签 / 归档 / 相关文章 / 上下篇 / 系列文章
- **全文搜索** —— 构建期生成索引，浏览器端打分排序，支持 `?q=` 分享链接
- **SEO 完整** —— canonical、Open Graph、Twitter Card、RSS、Sitemap、robots.txt
- **评论可选** —— 内置 Giscus（基于 GitHub Discussions），不配置就自动隐藏
- **自动部署** —— 推送即发布，自动识别仓库是否需要子路径

---

## 一、本地运行

需要 Node.js **22.12 或更高**。

```bash
npm install
npm run dev        # 打开 http://localhost:4321
```

其他命令：

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 本地开发（草稿文章也会显示） |
| `npm run build` | 构建到 `dist/`（自动过滤草稿） |
| `npm run preview` | 预览构建产物，和线上效果一致 |
| `npm run check` | TypeScript / Astro 类型检查 |
| `npm run new "标题"` | 新建一篇文章（自动生成文件名和 frontmatter） |

---

## 二、先改这几处

### 1. `src/consts.ts`（必改）

```ts
export const SITE = {
  title: 'Dev Notes',        // 站点标题
  author: '你的名字',         // 作者名，出现在页头、页脚、版权
  tagline: '...',            // 首页那行小字签名
  heroDescription: '...',    // 首页大段介绍
  description: '...',        // SEO 描述 + RSS 描述
};

export const SOCIALS = [
  { name: 'GitHub', url: 'https://github.com/你的用户名', icon: 'github' },
  { name: '邮箱', url: 'mailto:你的邮箱', icon: 'mail' },
  { name: 'RSS', url: '/rss.xml', icon: 'rss' },
];
```

### 2. `src/data/projects.ts`（可选）

「项目」页的数据。改数组里的内容即可，`platform` 字段会自动生成筛选按钮。

### 3. `public/og-default.png`（可选）

默认分享图。换成自己的 1200×630 图片就行。同目录的 `og-default.svg` 是同一张图的矢量模板，方便改配色和文字后重新导出。

### 4. Giscus 评论（可选，默认关闭）

见下面「开启评论」一节。

---

## 三、部署到 GitHub Pages

### 步骤

1. 在 GitHub 上新建一个仓库（**不要**勾选 Add README）。

2. 在项目目录里初始化并推送：

   ```bash
   git init -b main
   git add .
   git commit -m "chore: 初始化博客"
   git remote add origin https://github.com/你的用户名/你的仓库名.git
   git push -u origin main
   ```

3. 打开仓库的 **Settings → Pages**，把 **Source** 从 `Deploy from a branch` 改成 **`GitHub Actions`**。

4. 回到 **Actions** 页面，等「构建并部署到 GitHub Pages」跑完（第一次大约 1 分钟）。

5. 访问站点：
   - 仓库名是 `你的用户名.github.io` → `https://你的用户名.github.io/`
   - 其他仓库名 → `https://你的用户名.github.io/你的仓库名/`

之后就只要 `git push`，Actions 会自动重新构建发布。

### 关于子路径（重要，但已经自动处理）

GitHub Pages 有个坑：只有仓库名为 `<用户名>.github.io` 时站点才在根路径，其他仓库名都会部署在 `/<仓库名>/` 下。路径前缀对不上，全站链接和静态资源都会 404。

这个项目里有两层处理，正常使用不需要你操心：

1. `.github/workflows/deploy.yml` 会根据仓库名自动算出 `SITE_URL` 和 `BASE_PATH` 传给构建；
2. `integrations/base-links.mjs` 会在构建结束后，给 Markdown 正文里手写的 `[链接](/about/)` 补上前缀 —— 因为 **Astro 的 `base` 配置不会改写 Markdown 里写死的绝对路径**。

如果本地想模拟子路径部署：

```bash
# PowerShell
$env:BASE_PATH='/你的仓库名/'; npm run build; npm run preview
```

只想本地跑根路径（默认就是这样）就不用设任何环境变量。

### 换用其他托管

`npm run build` 产物是纯静态文件，`dist/` 直接丢到任何静态托管都能跑（Vercel / Netlify / Cloudflare Pages / 自己的服务器）。这时候记得把 `astro.config.mjs` 里的 `SITE_URL` 改成你的实际域名。

---

## 四、写文章

```bash
npm run new "Compose 重组到底什么时候会发生"
```

会在 `src/content/blog/` 下生成文件，文件名就是 URL。也可以直接手写：

```markdown
---
title: 文章标题
description: 摘要，会出现在列表页、搜索结果和 RSS 里
pubDate: 2026-09-18
category: Compose
tags: ['Compose', '性能优化']
---

正文……
```

### frontmatter 字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | ✅ | 标题 |
| `description` | ✅ | 摘要，建议 60–120 字 |
| `pubDate` | ✅ | 发布日期，写 `2026-09-18` 即可 |
| `category` | ✅ | 分类，**单选**，用于粗粒度聚合 |
| `tags` | | 标签数组，可多个，用于细粒度关联 |
| `updatedDate` | | 更新时间，填了会在文末显示「本文有过更新」 |
| `draft` | | `true` 时只在 `npm run dev` 可见，不会构建到线上 |
| `featured` | | `true` 时出现在首页「精选文章」 |
| `series` | | 系列名，同名文章会在详情页互相串联 |

分类和标签的列表页、聚合页全是自动生成的，新增分类不需要改任何配置。想让某个分类在列表页带上描述和主题色，在 `src/consts.ts` 的 `CATEGORY_META` 里登记一下即可（不登记也能正常用）。

### Markdown 增强语法

**代码块带文件名** —— 在语言后面加 `title="..."`：

````markdown
```kotlin title="MainActivity.kt"
class MainActivity : ComponentActivity()
```
````

**行高亮 / 增删 / 聚焦**：

````markdown
```kotlin
val a = 1 // [!code highlight]
val b = 2 // [!code ++]
val c = 3 // [!code --]
val d = 4 // [!code focus]
val e = 5 // [!code error]
```
````

也支持 `{1,3-5}` 这种按行号高亮（写在语言后面，如 ```` ```kotlin {2,4-6} ````），以及 `==高亮文字==`。

代码块右上角会自动显示语言，顶部会自动显示文件名，都靠 CSS 实现，不需要额外配置。

### 图片

放在 `public/` 下，然后用 `/xxx.png` 引用；或者放 `src/assets/` 走 Astro 的图片优化。注意引用路径要带上部署子路径（`public` 下直接用绝对路径时，本项目的 `base-links` 集成也会帮忙补前缀）。

---

## 五、开启评论（Giscus）

基于 GitHub Discussions，免费、无后端、无广告。

1. 确认仓库是 **public**，并在 **Settings → General → Features** 里勾选 **Discussions**。
2. 安装 [giscus App](https://github.com/apps/giscus)，授权给这个仓库。
3. 打开 [giscus.app](https://giscus.app/zh-CN)，填入仓库名，页面会生成 `data-repo-id` 和 `data-category-id`。
4. 把这两个值填进 `src/consts.ts`：

   ```ts
   export const GISCUS = {
     enabled: true,
     repo: '你的用户名/你的仓库名',
     repoId: 'R_kgDOxxxxxxx',
     category: 'Announcements',
     categoryId: 'DIC_kwDOxxxxxxxx',
     theme: 'preferred_color_scheme',
   };
   ```

5. 重新构建即可。没配置时评论区会自动隐藏，不会出现坏掉的 iframe。

---

## 六、绑定自定义域名

1. 在 `public/` 下新建 `CNAME` 文件，内容只有一行你的域名，例如 `blog.example.com`。
2. 在域名服务商处添加 DNS 记录：
   - 根域名 → 4 条 A 记录指向 `185.199.108.153`、`185.199.109.153`、`185.199.110.153`、`185.199.111.153`
   - 子域名 → 一条 CNAME 指向 `你的用户名.github.io`
3. 仓库 **Settings → Pages → Custom domain** 填上域名并保存，等证书签发。
4. 改一下 `astro.config.mjs` 顶部的默认值（这样本地构建也用的是正式域名）：

   ```js
   const SITE_URL = process.env.SITE_URL ?? 'https://blog.example.com';
   const BASE_PATH = process.env.BASE_PATH ?? '/';
   ```

   用自定义域名时站点在根路径，Workflow 里算出的 `BASE_PATH` 会是 `/你的仓库名/`，需要覆盖掉。最省事的做法是在仓库 **Settings → Secrets and variables → Actions → Variables** 里加两个变量 `SITE_URL` 和 `BASE_PATH`，然后把 workflow 里那两行的值改成 `${{ vars.SITE_URL }}` / `${{ vars.BASE_PATH }}`。

---

## 七、目录结构

```text
├── .github/workflows/deploy.yml   # 推送到 main 时自动构建发布
├── integrations/
│   └── base-links.mjs             # 给 Markdown 里的绝对链接补部署子路径
├── public/                        # 原样拷贝到产物根目录的静态文件
│   ├── favicon.svg
│   ├── og-default.png / .svg      # 默认分享图
│   └── .nojekyll
├── scripts/new-post.mjs           # npm run new 的脚手架
└── src/
    ├── components/                # Header / Footer / PostCard / 目录 / 评论 ……
    ├── consts.ts                  # ★ 站点配置都在这
    ├── content.config.ts          # 文章集合的 schema
    ├── content/blog/              # ★ 文章放这里
    ├── data/projects.ts           # 「项目」页数据
    ├── layouts/
    │   ├── BaseLayout.astro       # html / head / 页头 / 页脚
    │   └── PostLayout.astro       # 文章页（目录、阅读进度、上下篇、相关文章）
    ├── pages/                     # 文件即路由
    ├── styles/
    │   ├── global.css             # 设计令牌 + 全站样式
    │   └── prose.css              # 正文排版 + 代码块
    └── utils/                     # 链接、日期、文章聚合等工具函数
```

### 路由一览

| 路径 | 内容 |
| --- | --- |
| `/` | 首页：简介 + 精选文章 + 最近更新 + 项目 + 分类 |
| `/blog/` | 全部文章（分页，第 2 页起在 `/blog/page/2/`） |
| `/blog/<文件名>/` | 文章详情 |
| `/categories/`、`/categories/<slug>/` | 分类总览与分类文章 |
| `/tags/`、`/tags/<slug>/` | 标签云与标签文章 |
| `/archive/` | 按年份归档 |
| `/projects/` | 项目列表（可按平台筛选） |
| `/about/` | 关于 |
| `/search/` | 全文搜索 |
| `/rss.xml`、`/sitemap-index.xml`、`/robots.txt` | 订阅与 SEO |
| `/404.html` | 404 页面 |

---

## 八、常见问题

**构建时提示 `npm ci` 失败？**
`package-lock.json` 必须一起提交。如果本地删过 `node_modules`，先跑一次 `npm install` 再提交。

**`npm run dev` 起来了，但浏览器打不开 localhost:4321？**
多半是这台机器的 IPv6 回环（`::1`）不可用。Astro 默认的 `host` 是 `localhost`，在部分 Windows 环境会被解析成 `::1`，导致服务器只监听 IPv6 地址，而浏览器走 IPv4 就连接失败。

项目里已经把 `server.host` 固定成 `127.0.0.1`（见 `astro.config.mjs`），正常不会再遇到。如果还不行，按顺序试：

1. 换成 `http://127.0.0.1:4321/` 直接访问，绕开 DNS 解析。
2. 确认端口没被占用 —— Astro 发现端口被占会自动换一个（看终端打印的实际端口），照它给的地址访问。
3. 检查系统代理是否把 `localhost` 也劫持了。Windows 上可以在「设置 → 网络和 Internet → 代理」里确认 `<local>` 在绕过列表内。
4. 想在手机上打开，用 `npm run dev -- --host 0.0.0.0` 覆盖，然后访问终端打印的 Network 地址。

**Actions 里部署成功但页面 404？**
先确认 Settings → Pages 的 Source 选的是 `GitHub Actions`。再看 Actions 日志里「计算站点地址与子路径」这一步输出的 `子路径` 是否和实际访问路径一致。

**换了深色模式代码块没变色？**
Shiki 用的是双主题变量（`--shiki-light` / `--shiki-dark`），切换逻辑写在 `src/styles/prose.css` 靠 `:root[data-theme='dark']` 选中的部分，改主题名不要去动那段。

**草稿怎么发？**
把 frontmatter 里的 `draft: true` 删掉（或改成 `false`）再推送。草稿在本地 `npm run dev` 里始终可见。

**想加新的 Markdown 语法（比如 Mermaid 图表）？**
Astro 7 换成了 Sätteri 渲染管线，旧的 remark/rehype 插件方式已标记废弃。简单需求建议直接写 HTML 或 Astro 组件（`.mdx` 文件里可以直接 import 组件）。
