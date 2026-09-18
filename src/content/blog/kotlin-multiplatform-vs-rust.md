---
title: 跨平台小工具选型：KMP、Rust、Go 还是 TypeScript
description: 一年里写了六个非 Android 的小工具，四种技术栈都用过。这篇是我总结的选型决策表，以及每个选择事后是否后悔。
pubDate: 2026-01-20
category: 工具
tags: ['跨平台', 'Rust', 'Kotlin Multiplatform', 'TypeScript', '选型']
featured: true
series: 把 Kotlin 用到 Android 之外
---

去年一年我写了六个跟 Android 没什么关系的小工具。回头看，技术栈的选择基本决定了后面几周是「顺利」还是「别扭」。

这篇不讲技术对比，只讲**在什么场景下我会选什么**，以及事后有没有后悔。

## 我的选择顺序

做工具之前我会先问三个问题，顺序不能换：

1. **它需要跑在哪里？**（只有我自己的电脑 / 给同事用 / 给所有人用 / 跑在浏览器里）
2. **它的性能敏感点在哪？**（几乎没有 / I/O 密集 / CPU 密集）
3. **我要花多久才能写完？**

大多数时候答案在第二问就已经收敛了。

## 决策表

| 场景 | 我选 | 理由 |
| --- | --- | --- |
| 纯逻辑复用（Android + iOS + 后端） | Kotlin Multiplatform | 业务逻辑本来就是 Kotlin，直接抽出来就行 |
| 命令行工具，要分发给别人 | Rust 或 Kotlin + native-image | 单文件二进制，零依赖 |
| 需要跑在浏览器里 | TypeScript | 没有第二个选项 |
| 桌面 GUI，Android 团队维护 | Compose Multiplatform | 直接复用 Compose 的心智模型 |
| 一次性脚本 | Shell / Python | 不值得为它建一个工程 |
| 高并发网络服务 | Go | 部署简单，并发模型省心 |

## Kotlin Multiplatform：什么时候真的划算

KMP 最大的诱惑是「同一份代码，Android 和 iOS 都能用」。但它的成本常被低估：

- iOS 侧要有人能看懂 Xcode 报错和 Kotlin/Native 的内存模型；
- 依赖库不一定都有 KMP 版本，没有就得自己写 `expect/actual`；
- 调试是跨语言跨工具的，一个 bug 可能要在两边各查一遍。

所以我的判断标准很实际：**只有当这段逻辑足够复杂、且两个平台都要用、且改动频繁时，KMP 才划算。**

比如账号校验、加密、离线同步这类东西——写在共享模块里，改一次两边都生效，那就是净赚。

反过来，如果只是「一个数据类加上几个扩展函数」，抽出来共享反而增加了两个构建链的耦合。

```kotlin title="shared/Validation.kt"
// 这种程度的逻辑，共享才有意义
object CredentialValidator {
    private val PHONE = Regex("""^1[3-9]\d{9}$""")

    fun validate(input: String): ValidationResult = when {
        input.isBlank() -> ValidationResult.Empty
        !PHONE.matches(input) -> ValidationResult.InvalidFormat
        else -> ValidationResult.Ok
    }
}
```

## Rust：我为它付出的代价和收获

我用 Rust 写了一个图片批处理工具（把设计稿转成 Android 的多密度资源）。选择理由很直接：要基于 `image` 生态做高质量的 WebP/AVIF 编码，并且要一个能直接双击运行的二进制。

收获很大：处理 200 张图比原来的 Python 脚本快了一个数量级，内存占用还很稳定。

代价也不小：

- **上手那两周效率极低。** 借用检查器不是「学一下语法」就能习惯的，它是思维方式的重构。
- **异步生态太分散。** `tokio` / `async-std` / `smol`，选型就要花时间。
- **编译时间劝退。** 一个中等项目改一行等 30 秒是常态。

```rust title="src/export.rs"
pub fn export_densities(src: &Path, out: &Path) -> Result<()> {
    let img = image::open(src)?;

    // 关键路径上真的能省下大量 CPU
    for (suffix, scale) in [("mdpi", 1.0), ("hdpi", 1.5), ("xhdpi", 2.0), ("xxhdpi", 3.0)] {
        let w = (img.width() as f32 / scale).round() as u32;
        let resized = img.resize_exact(w, img.height() * w / img.width(), FilterType::Lanczos3);
        resized.save(out.join(format!("drawable-{suffix}/{}.webp", stem(src))))?;
    }
    Ok(())
}
```

**结论：如果需求里没有「性能」和「零依赖分发」这两条，我不会再选 Rust。** 它是很好的语言，但为一个小工具付出的学习成本可能超过工具本身的价值。

## TypeScript：被低估的选择

我做过一个「JSON 转 Kotlin 数据类」的小网页。选 TypeScript 不是因为它好，而是因为**它的产物就是浏览器本身**——不需要安装、不需要更新、发个链接就能用。

对这类「跑一次就扔」的工具，Web 的转化率远高于任何需要下载的东西。同事要转个 JSON，你发个链接他马上就用了；让他下载一个 20MB 的二进制，他大概率会继续手写。

代价是：一旦涉及复杂的状态管理，前端工程化的复杂度会迅速赶上后端项目。

## Go：我没用它，但知道什么时候该用

我没用 Go 写过工具，但在团队里维护过一个 Go 写的内部服务。它的优势非常具体：

- 单个二进制，交叉编译一行命令；
- goroutine 的并发模型不需要先理解生命周期；
- 标准库覆盖 HTTP / JSON / 模板，几乎不需要第三方依赖。

如果我要写一个需要长期运行、部署到服务器上的小服务，我会选 Go 而不是 Rust——**因为团队里其他人能看懂它。**

## 回头看的四条经验

1. **选型的第一约束是「谁维护」，不是「谁最快」。** 一个人写的 Rust 工具，团队里没人能改，它就是技术债。
2. **能不分发就不分发。** Web 工具的用户体验门槛最低，哪怕是内部工具。
3. **不要为了复用而复用。** 共享代码的成本要在「跨平台构建链」的维度上算，而不是行数。
4. **一次性需求就写一次性脚本。** 我浪费过两周把一个 Python 脚本「重构成工程」，而它总共只跑过三次。

写工具这件事，最终标准只有一个：**它有没有真的被用起来。**
