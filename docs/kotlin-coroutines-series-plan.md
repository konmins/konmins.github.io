# Kotlin 协程大白话系列 · 写作规划

> 这份文档是**写给自己的施工图**，不是系列里的一篇正文。
> 按它排的顺序写，读者能一路顺下来不卡壳；跳着写就会断。
>
> 本目录：`konmins.github.io`（Astro + GitHub Pages）

---

## 一、先明确这个系列的"人设"

**目标读者**：写过 Java / Kotlin，写过异步回调（Retrofit + Callback / RxJava），但没系统学过协程的 Android 开发。

**系列定位**：大白话。不从 API 文档的角度讲，从"你为什么会踩这个坑"的角度讲。

**每篇的三条铁律**：

1. **先讲痛点，再讲解法。** 不要一上来就贴代码。每个概念都从一个具体的"我遇到过这个现象"开始。
2. **每篇只解决一个核心问题。** 想讲两个问题就拆成两篇。
3. **每个概念配一个反例。** 大白话的意思是"你这样想其实是错的，我来告诉你为什么"。只讲正确用法，读者下次换个场景还是懵。

**单篇字数**：2000–3500 字。宁可短，不要长。一篇能讲透一个点，比一篇塞十个点强。

---

## 二、为什么是这个顺序

这个顺序不是按"API 分类"排的，是按**依赖关系**排的——每一篇都只用到前面已经讲过的东西，读者不需要回头翻旧文章。

```
suspend（会挂起）
   ↓ 没有 suspend 讲不了后面
Scope + Job + Dispatcher（三件套）
   ↓ 有了三件套才谈得上"管住"协程
结构化并发 → 取消 → 异常处理
   ↓ 生命周期讲清了
withContext / Flow（用法与数据流）
   ↓ 能用对了
Android 落地（真实场景）
```

**为什么取消不能放在最前面？**

取消是整套协程里最难的部分，也是最容易踩坑的部分。取消信号为什么能从一个协程传到另一个、为什么"取消"不等于"立刻停下"，这些都建立在 Job 的父子关系上——第 03 篇的三件套已经把这个前提铺好了，所以取消篇可以排在阶段二开头。（站内独立的《结构化并发》一文可作补充阅读。）

**为什么 Flow 放在中后期？**

Flow 是"用法层"的东西。读者得先知道协程怎么跑起来、怎么管住，才好理解"为什么需要一个流式的东西来发数据"。而且 Flow 和取消强耦合——中途讲取消对后面的 Flow 理解有直接帮助。

**为什么 Android 落地放最后？**

这是系列的"回报篇"。前面 10 篇都在讲机制，这一篇把机制装回真实代码。读者的获得感在这里最强，也最容易转化成收藏和转发。

---

## 三、站点约定（Astro）

### frontmatter 规范

`src/content.config.ts` 定义的 schema：

| 字段 | 必填 | 说明 |
|---|---|---|
| `title` | ✅ | ≤ 80 字 |
| `description` | ✅ | ≤ 200 字，会显示在列表页 / SEO / RSS |
| `pubDate` | ✅ | `YYYY-MM-DD`，**系列顺序按它升序排** |
| `updatedDate` | — | 最后更新时间 |
| `category` | ✅ | 单选，用 `CATEGORY_META` 里登记过的（Android / Kotlin / Compose / 工具 / 工程实践 / 随笔） |
| `tags` | — | 数组，`tags: ['Kotlin', '协程']` |
| `draft` | — | 默认 `false`；`true` 时只有 dev 能看到，不进生产构建 |
| `featured` | — | 首页「精选文章」区块 |
| `series` | — | 系列名，**必须完全一致**才能串联 |

### 系列名

统一用：`Kotlin 协程大白话`

### 发布顺序

`getSeriesPosts` 按 `pubDate` 升序排，所以日期要严格递增。当前排期：

| 篇目 | 文件 | pubDate |
|---|---|---|
| 01 协程到底是个什么东西 | `kotlin-coroutines-what-is-coroutine.md` | 2026-11-04 |
| 02 suspend 挂起的到底是什么 | `kotlin-coroutines-suspend-inside.md` | 2026-11-05 |
| 03 Scope、Job、Dispatcher 三件套 | `kotlin-coroutines-three-pillars.md` | 2026-11-06 |
| 04 launch、async、run 怎么选 | `kotlin-coroutines-launch-async-run.md` | 2026-11-09 |

> 站内原有的《结构化并发：为什么不该再用 GlobalScope》（`kotlin-coroutines-structured-concurrency.md`，2026-11-08）
> **已移出系列**（2026-11-09 移除 `series` 字段），回归独立文章。它讲的是协程树与父子关系，
> 和第 04 篇讲的「异常隔离」互补，文中已互相引用。系列因此定为 **13 篇**。

### 排版特性（Typecho 没有的）

- **代码块文件名**：```` ```kotlin title="UserRepository.kt" ```` → 顶部显示文件名标签 + 右上角语言标签
- **Shiki 双主题**：亮/暗自动切换，代码高亮质量远高于 Typecho
- **行内注释高亮**：支持 `// [!code highlight]`、`// [!code ++]`、`// [!code --]`、`// [!code focus]`
- **表格**：GFM 原生支持，样式已配好
- **右侧目录**：自动抓 h2/h3，带滚动高亮
- **系列串联**：详情页底部自动列出同系列全部文章，序号自动生成
- **上下篇导航**：按 `pubDate` 时间线自动算
- **相关文章**：同系列 +5 分，同分类 +3 分，标签重合 +2 分

### 正文不该出现的

- **`# 一级标题`** —— 标题由 `PostLayout.astro` 的 `post-title` 渲染，正文再来一遍会重复
- **HTML 注释头** —— Typecho 那套 `<!-- 标题：xxx -->` 在 Astro 用不上，统一走 YAML frontmatter

---

## 四、阶段一：先把概念搞明白（4 篇）

> 目标：读完这 4 篇，读者能用自己的话说出"协程是什么、suspend 到底 suspend 了什么、协程跑在哪个线程上"。

### 第 01 篇 · 协程到底是个什么东西 `✅ 已完成`

> 稿件：`src/content/blog/kotlin-coroutines-what-is-coroutine.md`（2283 中文字，6 个代码块，2 张对比表）

**大白话切入**：从回调地狱的经典代码开始，展示一段三层嵌套的 Retrofit 回调，然后问："这玩意儿能不能用顺序写？"

**核心问题**：协程解决了什么？——**用同步的写法，做异步的事**。

**要讲清的点**：
- 协程**不是**线程，是"可以挂起的函数调用"
- 和线程池的区别：线程是操作系统资源，协程是编程语言的抽象
- "挂起"是什么意思：不是阻塞线程，是**把线程让出去**，等条件满足了再拿回来接着跑
- 类比统一：**线程 = 车道，协程 = 车**；车可以驶进路边停车带暂歇，把车道让给后面的车

**关键反例**：很多人以为 `suspend` 会阻塞线程 → 明确纠正。

---

### 第 02 篇 · suspend 挂起的到底是什么 `✅ 已完成`

> 稿件：`src/content/blog/kotlin-coroutines-suspend-inside.md`（2854 中文字，15 个代码块）

**大白话切入**：上一篇留的悬念——"下台之后，台词记在哪儿？"从"挂起时销毁了栈帧，变量必须搬家"切入。

**核心问题**：`suspend` 这个关键字到底做了什么？

**要讲清的点**：
- 挂起时销毁的是**栈帧**，跨挂起点的变量搬到 `Continuation` 对象上
- 编译器把函数改写成**带 label 编号的状态机**（CPS 变换）
- `COROUTINE_SUSPENDED` 是"我挂起了"的暗号
- **恢复 = 重新从头进入 + 靠 `label` 跳页**，不是"接着往下走"
- `delay` 不占线程（定时器回调），`Thread.sleep` 占线程（native 挂起）

**实测数据**（已写进文章）：

```
[A] 1000 协程 delay(1000): 耗时 1025ms, 线程数=12
[C] 单线程 1000 协程 delay(500): 耗时 514ms
```

---

### 第 03 篇 · Scope、Job、Dispatcher 三件套 `✅ 已完成`

> 稿件：`src/content/blog/kotlin-coroutines-three-pillars.md`

**大白话切入**：从"协程自己不会结束，是谁让它结束的？"切入，用一段 `GlobalScope.launch` 引出全文。

**核心问题**：三件套分别管什么？

**要讲清的点**：
- `Dispatcher` 管**在哪个线程跑**（`Main` / `IO` / `Default`）
- `Job` 管**生命周期**（状态查询 / `join()` 等待 / `cancel()` 请求取消）
- `Scope` = `CoroutineContext`（Dispatcher + Job）+ 批量管理能力
- **`GlobalScope.coroutineContext` 是 `EmptyCoroutineContext`，连 Job 都没有**（实测 `null`）

**实测数据**（已写进文章）：

```
[G1] GlobalScope.coroutineContext[Job] = null
[S2] 取消后 父Job.isActive=false 子1.isCancelled=true
```

**关键反例**：
- "`GlobalScope.launch` 返回的 Job 存下来不就能取消了？" → 能存，但没人会帮你存，
  且它和触发它的操作没有任何绑定关系
- **IO 和 Default 的线程池**：纯 JVM 上两者共用线程池（实测重叠 11 个线程），
  Android 上 IO 才有独立的 64 线程池——这是个常见写错的点

**记忆口诀**：Dispatcher 管"在哪"，Job 管"多久"，Scope 管"多少"。

---

### 第 04 篇 · launch、async、run 怎么选 `✅ 已完成`

> 稿件：`src/content/blog/kotlin-coroutines-launch-async-run.md`（13 个代码块，全部编译并实跑通过）

**大白话切入**：三个函数长得像，返回值类型还不一样，选错了就出 bug。

**核心问题**：什么时候用哪个？

**要讲清的点**：
- `launch` 返回 `Job`，不产出结果
- `async` 返回 `Deferred<T>`，产出结果，**必须在作用域内 await**
- `run` 是标准库的普通函数，**不是启动协程**——它同步执行并阻塞当前线程（实测 303ms，线程名 main）
- 真正会阻塞的是 `runBlocking`

**关键反例（实测数据支撑）**：
- `async` 不 await，异常去向随作用域而变：
  - 普通 `coroutineScope` → 取消父作用域，从边界抛出
  - `supervisorScope` → **完全静默**，躺在 Deferred 里，连日志都没有
  - `SupervisorJob()` 独立 scope → 交给 `CoroutineExceptionHandler`，业务代码无感
- **最反直觉的一条**：`await` 了、`try/catch` 了，`coroutineScope` 本身**照样失败**——
  因为异常发生的那一刻父作用域就已被取消，`await` 只能让异常"可见"，无法"撤回"。
  想真正隔离错误必须用 `supervisorScope`。
- 并行请求的真实后果：一个失败会**连坐**另一个（`coroutineScope`），
  换 `supervisorScope` 才是"该成功的成功、该失败的单独失败"。

---

## 五、阶段二：用对它，别用错（3 篇）

### 第 05 篇 · 取消：为什么停不下来 `🔄 待改`

> 现有深度版稿在 `/Users/konmin/Documents/workbuddy/posts/coroutine-cancellation.md`（3530 中文字，26 个代码块，
> 含 Go/JS/C# 横向对比 + 测试章节）。需要拆成大白话主篇 + 番外。

### 第 06 篇 · 异常处理：错误都去哪了 `⬜ 待写`

> 第 04 篇已经讲了「异常隔离」的一半（`await` / `try-catch` 与 `supervisorScope` 的区别），
> 这一篇补上另一半：异常怎么在协程树里传播、`CoroutineExceptionHandler` 什么时候用。

### 第 07 篇 · withContext 换个线程干活 `⬜ 待写`

---

## 六、阶段三：异步数据流（3 篇）

### 第 08 篇 · Flow：把回调变成一条流 `⬜ 待写`
### 第 09 篇 · StateFlow 与 SharedFlow `⬜ 待写`
> 站内已有 `kotlin-cold-flow-vs-hot-flow.md`，可作交叉引用

### 第 10 篇 · callbackFlow 与老代码共存 `⬜ 待写`

---

## 七、阶段四：Android 落地（3 篇）

### 第 11 篇 · 生命周期作用域怎么选 `⬜ 待写`
### 第 12 篇 · 和 Retrofit、Room 怎么配合 `⬜ 待写`
### 第 13 篇 · 实战：改写一个老页面 `⬜ 待写`

---

## 八、番外

- **番外 A** · 横评 Kotlin / Go / JS 的取消模型
- **番外 B** · 面试高频题与误区

---

## 九、每篇的写法要求

- 先讲痛点再讲解法，不一上来贴代码
- 每篇只解决一个核心问题，想讲两个就拆
- **每个概念配一个反例**——"你这样想其实是错的"
- 单篇 2000–3500 字，宁短勿长
- 开头放系列目录、结尾放下篇预告，做连载感
- 类比**全文统一**，同一件事不换三次说法

---

## 十、写作与校验流程

### 工具链

```bash
# 开发服务器（首次启动约 30s）
cd /Users/konmin/Documents/konmins.github.io && npm run dev

# 代码编译验证（提取 md 里所有 kotlin 块逐个编译 + 运行）
python /Users/konmin/.workbuddy/skills/tech-blog-writing/scripts/verify_code.py <md> --run

# 排版截图
"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" --headless --disable-gpu \
  --no-sandbox --hide-scrollbars --screenshot=/tmp/shot.png --window-size=1200,2000 \
  --virtual-time-budget=8000 --proxy-server="direct://" --proxy-bypass-list="*" \
  "http://127.0.0.1:4321/blog/<slug>/"
```

**注意**：本机装了代理，`curl` / Edge 访问 `127.0.0.1` 必须加 `--noproxy '*'` /
`--proxy-server="direct://"`，否则返回 502。

### 发布前检查清单

见 `~/.workbuddy/skills/tech-blog-writing/references/article-guidelines.md`

---

## 十一、当前进度

| 状态 | 篇目 |
| --- | --- |
| ✅ 已完成 | 第 01 篇 · 协程到底是个什么东西 |
| ✅ 已完成 | 第 02 篇 · suspend 挂起的到底是什么 |
| ✅ 已完成 | 第 03 篇 · Scope、Job、Dispatcher 三件套 |
| ✅ 已完成 | 第 04 篇 · launch、async、run 怎么选（2026-11-09 新写，13 个代码块实跑通过） |
| 🔄 待改 | 第 05 篇 · 取消（深度版稿在 workbuddy/posts/，3530 字待重排） |
| ⬜ 待写 | 第 06 – 13 篇 |
| ⬜ 待写 | 番外 A / B |
| 🚫 已移出 | 结构化并发（站内旧文，2026-11-09 移除 series 字段，回归独立文章） |

---

## 十二、2026-11-04 补充：环境踩坑记录

### 代理导致本地访问 502

本机装了代理（v2rayA），`curl` / Edge 访问 `127.0.0.1` 会走代理返回 502。

```bash
# curl
curl --noproxy '*' http://127.0.0.1:4321/

# Edge headless 截图
"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" --headless \
  --proxy-server="direct://" --proxy-bypass-list="*" \
  --screenshot=out.png --window-size=1200,1800 --virtual-time-budget=8000 \
  "http://127.0.0.1:4321/blog/<slug>/"
```

### 系统临时目录不可写

`/tmp`、`/var/folders/.../T` 可能变成不可写（`No usable temporary directory found`）。
校验脚本已加 fallback：依次尝试 `tempfile.gettempdir()` → `~/.kt-verify` → `./.kt-verify`。

### Astro dev 启动慢

首次启动约 27 秒（"astro v7.3.3 ready in 27592 ms"）。启动完成前探测会得到 502，
**不是服务挂了**，等一会儿再测。

### 校验脚本的正则要认 meta

Astro 用 Shiki 的 ```` ```kotlin title="X.kt" ```` 形式（带 meta），
原正则 `r"```kotlin\n(.*?)```"` 匹配不到。已改为
`r"```([a-zA-Z]+)([^\n]*)\n(.*?)```"` 并按语言过滤。

### 片段代码块要自带 import

文章里的片段（不是完整程序）如果不写 `import kotlinx.coroutines.*`，
读者复制下来会直接报 unresolved reference。写片段时把 import 带上。
