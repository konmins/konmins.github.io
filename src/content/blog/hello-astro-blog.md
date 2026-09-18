---
title: 用 Astro 重新搭了这个博客
description: 为什么放弃现成的博客框架，改用 Astro 手写一套：构建只要几秒、几乎没有客户端 JS、Markdown 写完 git push 就自动发布。
pubDate: 2026-09-10
category: 随笔
tags: ['Astro', '博客', 'GitHub Pages']
---

之前用 Hexo，后来折腾过一阵子 Next.js。这次换成 Astro，原因很朴素：**我只需要一个写文章的地方，不想再跟框架本身较劲了。**

## 为什么是 Astro

一句话概括：它默认输出纯静态 HTML，客户端 JavaScript 是「按需添加」而不是「默认带上」。

| 方案 | 构建产物 | 我的顾虑 |
| --- | --- | --- |
| Hexo | 纯静态 | 主题生态老旧，改样式要动别人的模板 |
| Next.js | 静态 + 大量 JS | 一个纯文字博客要下载几百 KB 的运行时，不划算 |
| Astro | 纯静态 + 按需 JS | 组件写起来跟 React 差不多，但产物干净 |

最直接的好处是：这个博客的深色模式、目录高亮、搜索这些交互，加起来只有几 KB 的 JS。

## 文章就是一个 Markdown 文件

在 `src/content/blog/` 下新建一个 `.md`，文件名就是 URL：

```bash title="新增一篇文章"
npm run new "Compose 重组到底什么时候会发生"
```

也可以手写 frontmatter：

```markdown title="src/content/blog/my-post.md"
---
title: 文章标题
description: 摘要，会出现在列表页和搜索结果里
pubDate: 2026-09-10
category: Kotlin
tags: ['协程', '并发']
featured: false
---
```

> `category` 是单选，用来做粗粒度聚合；`tags` 可以多个，用来做细粒度关联。
> 两者都会自动生成列表页，不需要额外配置。

## 代码块能做的事

写技术文章最在意的就是代码展示。这里有文件名、行高亮、以及增删标记：

```kotlin title="MainActivity.kt"
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            AppTheme {
                HomeScreen()
            }
        }
    }
}
```

改代码的时候，用 `[!code ++]` 和 `[!code --]` 标出增删：

```kotlin title="HomeScreen.kt"
@Composable
fun HomeScreen(viewModel: HomeViewModel = viewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle() // [!code --]
    val state by viewModel.state.collectAsState() // [!code ++]
}
```

只想强调某一行，用 `[!code highlight]`：

```kotlin
fun format(size: Long): String {
    require(size >= 0) { "size 不能为负" } // [!code highlight]
    return "${size / 1024} KB"
}
```

## 发布流程

整个流程只有一步——提交并推送：

```bash
git add .
git commit -m "post: 用 Astro 重新搭了这个博客"
git push
```

推上去之后 GitHub Actions 会自动安装依赖、构建、发布到 GitHub Pages，一分钟左右就能看到线上版本。

## 接下来

这套站点还在继续改：想加代码块的复制按钮、给文章补上封面图，以及把阅读量统计接进来。

如果你也想用同样的方式搭一个，去看[关于页面](/about/)里留的仓库地址，直接 fork 就行。
