---
title: Scope、Job、Dispatcher 三件套
description: 协程自己不会结束，是谁让它结束的？讲清三个主角分别管什么、怎么绑在一起，以及为什么 GlobalScope 是个坏味道。
pubDate: 2026-11-06
category: Kotlin
tags: ['Kotlin', '协程', 'Job', 'Dispatcher', 'CoroutineScope']
draft: false
featured: false
series: Kotlin 协程大白话
---

> **系列导航**：这是「Kotlin 协程大白话」系列的第 3 篇，共 14 篇主线 + 2 篇番外。
> 上一篇我们钻进了 `suspend` 里面，看清它被编译器改造成了什么样子。这篇往上走一层，看看**谁来管这些协程**。

前两篇我们把"协程是什么"讲清楚了。但有一个问题一直没解决：

> **协程自己不会结束。是谁让它结束的？**

上一篇埋的伏笔还记得吗？`Continuation` 里存了三样东西——执行位置、跨挂起点的变量、还有一个 `CoroutineContext`。当时我说"归谁管"的来源就在 `CoroutineContext` 里。

这一篇就把这件事说清楚。答案藏在三个名字里：

- **`Dispatcher`** —— 决定**在哪个线程跑**
- **`Job`** —— 决定**什么时候结束、能不能被取消**
- **`CoroutineScope`** —— 把前两个**绑在一起**，并且能**一次性管住一整片**协程

先看一段代码。

## 一段"没人管"的代码

这是我从一个老项目里翻出来的：

```kotlin title="FeedViewModel.kt"
class FeedViewModel : ViewModel() {

    fun refresh() {
        GlobalScope.launch {
            val feed = api.loadFeed()
            _feed.value = feed
        }
    }
}
```

能跑，也没崩过。但它有三个说不清的问题：

1. 用户退出页面了，这个请求还在跑——**没人能停它**
2. `refresh()` 被调用两次，两个请求都活着——**没人知道有多少个在跑**
3. 想在测试里等它结束？**做不到**，因为没有句柄可以 `join`

问题的根子在 `GlobalScope` 这四个字上。但要讲清楚它为什么坏，得先把三件套是什么讲明白。

## Dispatcher：决定在哪个线程跑

`Dispatcher` 就是一个"线程调度器"，它回答一个问题：**这个协程的代码，该在哪个线程上执行？**

常用的有三个：

```kotlin title="Dispatchers.kt"
import kotlinx.coroutines.Dispatchers

Dispatchers.Main      // Android 主线程（UI 线程）
Dispatchers.IO        // 适合阻塞型 IO：网络、文件、数据库
Dispatchers.Default   // 适合 CPU 密集型计算
```

规则很简单：

| 你要做的事 | 用哪个 |
|---|---|
| 更新 UI | `Main`（不写就默认是 Main） |
| 网络请求、读文件、查数据库 | `IO` |
| 图片处理、复杂计算、加密解密 | `Default` |

实测一下它们的线程：

```kotlin title="ThreadDemo.kt"
import kotlinx.coroutines.*

fun main(): Unit = runBlocking {
    println("runBlocking  -> ${Thread.currentThread().name}")
    withContext(Dispatchers.IO)        { println("IO        -> ${Thread.currentThread().name}") }
    withContext(Dispatchers.Default)   { println("Default   -> ${Thread.currentThread().name}") }
    withContext(Dispatchers.Unconfined) { println("Unconfined-> ${Thread.currentThread().name}") }
}
```

实际输出：

```text
runBlocking  -> main
IO        -> DefaultDispatcher-worker-1
Default   -> DefaultDispatcher-worker-1
Unconfined-> main
```

**注意 IO 和 Default 的线程名一模一样。** 这不是 bug，是 kotlinx 在纯 JVM 上的实现：两个 Dispatcher 共用一个线程池，靠弹性扩容来区分。

但在 **Android 上不一样**——`Dispatchers.IO` 有自己独立的线程池，最多 64 个线程，专门给阻塞型 IO 用；`Dispatchers.Default` 的并行度等于 CPU 核数。所以你在 Android 上看到 IO 跑在 `DefaultDispatcher-worker-*` 还是别的名字，取决于具体版本，但**两者的行为差异是真实存在的**：

- `Default` 线程数 = CPU 核数，线程是"贵"的，每个都该跑满 CPU 时间
- `IO` 线程数可以到 64，线程大部分时间在等 IO，不占 CPU

> **一句话选型**：不确定就用 `IO`。它有独立线程池，专门为"大部分时间在等"设计的，比 `Default` 更不容易把 CPU 打满。

## Job：决定什么时候结束

`Job` 是每个协程都有的一个"身份标识 + 生命周期记录"。它主要提供三样东西：

**一、状态查询**

```kotlin title="JobState.kt"
import kotlinx.coroutines.*

val job = launch { delay(100) }
println(job.isActive)      // true  - 正在跑
println(job.isCompleted)   // false - 还没结束
println(job.isCancelled)   // false - 没被取消

job.join()                  // 等它真的结束
println(job.isCompleted)   // true
```

**二、等待结束** —— `join()`

`join()` 是**挂起函数**，会等这个 Job 真正结束才返回。这一点很重要，因为普通代码里的 `join()` 是阻塞当前线程，协程里的 `join()` 则是"挂起让出线程"。

**三、取消** —— `cancel()`

```kotlin title="CancelDemo.kt"
import kotlinx.coroutines.*

val job = launch { delay(10_000) }
job.cancel()      // 请求取消
job.join()        // 等它真的停下来
println(job.isCancelled)   // true
```

`cancel()` 只是**发一个取消信号**，不是"杀死"协程。协程要在下一个挂起点（`delay`、网络请求等）才会真正停下来。这个细节第 06 篇会专门讲。

## Scope：把两者绑在一起

现在关键的一步来了。

前面说过，`Continuation` 里存着一个 `CoroutineContext`。这个 context 里装着两样最重要的东西：

```
CoroutineContext
├── Dispatcher    → 我在哪个线程跑
└── Job           → 谁管我、什么时候结束
```

而 `CoroutineScope` 是什么？**它就是一个"配好了 context 的工厂"**：

```kotlin title="ScopeFactory.kt"
import kotlinx.coroutines.*

val scope = CoroutineScope(Dispatchers.Default + Job())
```

这一行做了三件事：

1. 给我一个 `Dispatcher` → 所有从它启动的协程都跑在 Default 上
2. 给我一个 `Job` → 所有从它启动的协程都是它的子协程
3. 把两者合成一个 `CoroutineContext` → 启动协程时传进去

所以 `CoroutineScope` 的能力，本质上就是 `CoroutineContext` 加上"能拿到那个 Job 去取消"。

**Scope 真正的价值是：一次取消，干掉一整片。**

```kotlin title="ScopeDemo.kt"
import kotlinx.coroutines.*

val scope = CoroutineScope(Dispatchers.Default + Job())

val kids = (1..3).map { scope.launch { delay(10_000) } }
// kids 是 3 个独立的 Job

scope.cancel()             // 取消父 Job
kids.forEach { it.join() }
println(kids[0].isCancelled)   // true —— 三个都被连带取消了
```

实测输出：

```text
[S1] 子协程数=3 父Job.isActive=true
[S2] 取消后 父Job.isActive=false 子1.isCancelled=true
```

`scope.cancel()` 取消的是**父 Job**，子协程因为是它的孩子，被**连带取消**。

这就是"结构化并发"的核心机制：**父子关系**。下一章（[第 05 篇 · 结构化并发](https://konmins.github.io/blog/kotlin-coroutines-structured-concurrency/)）会展开讲。

## 为什么 GlobalScope 是个坏味道

现在回到开头那段代码。

`GlobalScope` 是个特殊的 `CoroutineScope`，它的定义大致是：

```kotlin title="GlobalScope.kt"
public object GlobalScope : CoroutineScope {
    override val coroutineContext: CoroutineContext
        get() = EmptyCoroutineContext     // ← 注意这里
}
```

**空的。** 什么都没有。

这意味着：

- 没有 `Dispatcher` → 协程跑在 `Dispatchers.Default` 上（这是唯一的默认兜底）
- 没有 `Job` → **没有任何东西能取消它**

第二点是致命的。实测一下：

```kotlin title="GlobalScopeDemo.kt"
import kotlinx.coroutines.*

fun main(): Unit = runBlocking {
    // GlobalScope 的上下文里，连 Job 都没有
    println("GlobalScope.coroutineContext[Job] = ${GlobalScope.coroutineContext[Job]}")

    // 对比：普通 scope 是有 Job 的
    val scope = CoroutineScope(Dispatchers.Default + Job())
    println("普通 scope 的 Job = ${scope.coroutineContext[Job]}")
}
```

实际输出：

```text
GlobalScope.coroutineContext[Job] = null
普通 scope 的 Job = JobImpl{Active}@63753b6d
```

**`null`。**

这就是 `GlobalScope` 的全部问题所在：它启动的协程是"孤儿"。没有父级，没有归属，因此：

- 没人能取消它（除非你自己把 `Job` 存下来，但 `GlobalScope.launch` 返回的 Job 谁会存？）
- 它的生命周期和任何东西都不绑定
- 页面关了、ViewModel 销毁了，它还在跑

> **❌ 常见误解**：`GlobalScope.launch` 返回的 `Job` 你不是可以拿到吗？存下来不就能取消了？
>
> **✅ 实际情况**：能存，但**没人会帮你存**。这个 Job 脱离了任何生命周期，你的业务代码里也未必有地方放它。更关键的是——**它和触发它的那个操作没有任何绑定关系**。用户点了刷新，然后立刻退出页面，这个"刷新"没有任何东西跟着一起死。

而且 `GlobalScope` 在 kotlinx.coroutines 里被标成了 **delicate API**（编译器会给你警告）：

```text
warning: this is a delicate API and its use requires care.
Make sure you fully read and understand documentation of the declaration
that is marked as a delicate API.
```

库作者的态度很明确：**这东西能用，但基本不该用。**

### 那该用什么

Android 上有两个现成的、生命周期感知的 Scope：

```kotlin title="GoodScope.kt"
// 在 ViewModel 里
class FeedViewModel : ViewModel() {
    fun refresh() {
        viewModelScope.launch {          // ← ViewModel 销毁时自动取消
            val feed = api.loadFeed()
            _feed.value = feed
        }
    }
}

// 在 Activity/Fragment 里
class FeedActivity : AppCompatActivity() {
    fun refresh() {
        lifecycleScope.launch {          // ← Activity 销毁时自动取消
            val feed = api.loadFeed()
            binding.text.text = feed.title
        }
    }
}
```

`viewModelScope` 和 `lifecycleScope` 都是预先配好了 `Job` 的 Scope，它们的 Job 会在宿主销毁时自动取消。

**同一段逻辑，改用 `viewModelScope` 之后：**

| | `GlobalScope.launch` | `viewModelScope.launch` |
|---|---|---|
| 页面退出时 | 还在跑 | 自动取消 |
| 能不能统一管理 | 不能 | 能（都在这个 Scope 下） |
| 测试里能等它结束 | 难 | 能 |
| 编译器警告 | 有 | 无 |

**这就是全篇的重点：**

> **协程需要一个"归属"。`GlobalScope` 恰恰是"无归属"的代名词，所以它是坏味道。**

## 三件套的关系，用一张图记住

```text
CoroutineScope
  │
  ├── CoroutineContext
  │     ├── Dispatcher  → 在哪个线程跑
  │     └── Job         → 什么时候结束 / 谁管我
  │
  └── 能力：一次性管住这一片协程
        scope.cancel()  →  父 Job 取消 → 所有子协程连带取消
```

**记忆口诀**：

- **Dispatcher 管"在哪"** —— 位置
- **Job 管"多久"** —— 时间
- **Scope 管"多少"** —— 范围

## 本篇要点

1. **`Dispatcher` 决定在哪个线程跑**：`Main` / `IO` / `Default`，不确定就用 `IO`
2. **`Job` 是协程的生命周期标识**：查状态、`join()` 等待、`cancel()` 请求取消
3. **`CoroutineScope` = `CoroutineContext`（Dispatcher + Job）+ 批量管理能力**
4. **Scope 的核心价值是"一次取消，干掉一整片"**——这是父子关系的基础
5. **`GlobalScope` 的 `coroutineContext` 是空的**，连 `Job` 都没有，所以没人能取消它

最重要的一条：

> **写协程的第一件事不是"怎么启动"，而是"这个协程归谁管"。**

## 下一篇

下一篇解决一个具体问题：`launch`、`async`、`run` 三个函数长得像，返回值还不一样，**到底该用哪个**。

会讲清：`async` 创建了却忘了 `await` 会导致异常被静默吞掉这个坑，以及 `launch` 拿到的 `Job` 和 `async` 拿到的 `Deferred` 到底差在哪。

→ **第 04 篇 · launch、async、run 怎么选**

---

*本系列共 14 篇主线 + 2 篇番外，按顺序读最省力。如果你觉得这篇讲清楚了，回博客点个赞就是最大的支持——我会更有动力把它写完。*
