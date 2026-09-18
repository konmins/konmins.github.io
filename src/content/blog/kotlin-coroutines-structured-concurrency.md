---
title: 结构化并发：为什么不该再用 GlobalScope
description: 从一次并行请求写错导致的「页面关了请求还在跑」说起，讲清 CoroutineScope、Job 层级、异常传播，以及 supervisorScope 到底什么时候用。
pubDate: 2026-08-22
category: Kotlin
tags: ['Kotlin', '协程', '并发', 'Android']
featured: true
---

刚接触协程时，我写过这样的代码：

```kotlin
fun load() {
    GlobalScope.launch {
        val a = api.fetchA()
        val b = api.fetchB()
        updateUi(a, b)
    }
}
```

能跑，但埋了两个雷：

1. 页面已经销毁了，请求还在跑，回调回来时 `Activity` 早就没了；
2. 没人持有这个 `Job`，取消不了，测试里也没法等它结束。

后来才明白，问题的根子是**这个协程没有归属**。结构化并发要解决的，就是让每个协程都有明确的父级和作用域。

## 协程是有父子关系的

`launch` / `async` 都是 `CoroutineScope` 的扩展函数，它们创建的协程会成为该作用域的子协程。于是形成一棵树：

```text title="协程树"
viewModelScope
├── launch (loadFeed)
│   ├── async (fetchUser)
│   └── async (fetchPosts)
└── launch (observeEvents)
```

这棵树带来三条规则：

- **父协程会等子协程结束**，`coroutineScope { }` 返回时，里面所有子协程都已完成；
- **取消会向下传播**，取消父级，所有子协程一起被取消；
- **异常会向上传播**，子协程失败会取消父协程，并继续往上冒泡。

所以只要用 `viewModelScope`，页面销毁时 `ViewModel.onCleared()` 自动取消整个作用域，上面那两个雷就都没了。

## 并行请求：async + coroutineScope

需要并发拿两份数据再合并，正确写法是这样：

```kotlin title="FeedRepository.kt"
suspend fun loadFeed(userId: String): Feed = coroutineScope {
    val user = async { api.fetchUser(userId) }
    val posts = async { api.fetchPosts(userId) }

    Feed(user = user.await(), posts = posts.await())
}
```

`coroutineScope` 在这里做了两件事：给两个 `async` 提供父作用域，并且**在任意一个失败时立刻取消另一个**。

用 `withContext` 串行调用也能「不出错」，但两次网络请求会白白排队：

```kotlin title="FeedRepository.kt"
suspend fun loadFeed(userId: String): Feed = withContext(Dispatchers.IO) {
    val user = api.fetchUser(userId)   // [!code --]
    val posts = api.fetchPosts(userId) // [!code --]
    Feed(user, posts)
}
```

> 注意：`async` 只有调用 `await()` 时才会把异常抛出来。如果创建了 `async` 却从不 `await`，异常会被吞掉——
> 这也是为什么在 `coroutineScope` 里创建 `async` 却忘了 `await` 是很危险的事。

## 一个失败不该拖垮全部

有些场景恰恰相反：一个接口挂了，其余的数据还是要展示。这时候需要切断异常向上传播：

```kotlin title="DashboardViewModel.kt"
suspend fun loadDashboard(): Dashboard = supervisorScope {
    val profile = async { runCatching { api.profile() }.getOrNull() }
    val orders = async { runCatching { api.orders() }.getOrNull() }
    val coupons = async { api.coupons() }

    Dashboard(
        profile = profile.await(),
        orders = orders.await(),
        coupons = coupons.await(),
    )
}
```

区别很关键：

| | `coroutineScope` | `supervisorScope` |
| --- | --- | --- |
| 子协程失败 | 取消所有兄弟协程 | 只影响自己，兄弟继续跑 |
| 异常抛出时机 | 立即，向上冒泡 | 调用 `await()` 时才抛出 |
| 适用场景 | 一个都不能少 | 允许部分降级 |

`supervisorScope` 里那个没包 `runCatching` 的 `coupons`，一旦失败就会在 `await()` 处抛出，把 `loadDashboard` 整个中断——这正是我们想要的：优惠券拿不到可以空着，但请求本身出错要能被上层感知。

## 取消是协作式的

取消一个协程并不会「杀掉」它，只是给它打上标记，需要协程自己在挂起点配合。所以：

```kotlin title="SuspendWorker.kt"
suspend fun process(items: List<Item>) {
    for (item in items) {
        ensureActive() // [!code ++]
        heavySyncWork(item)
    }
}
```

纯计算的循环里没有挂起点，协程永远不会被取消。`ensureActive()` 会检查取消状态并抛出 `CancellationException`。

还有两个常见坑：

- **不要吞掉 `CancellationException`**。`runCatching` 会连它一起捕获，导致取消失效。要用就先判断类型再决定是否重新抛出。
- **`finally` 里的清理要能被打断**。如果需要保证清理逻辑执行完，用 `withContext(NonCancellable) { }` 包住。

## 现在回头看

有了结构化并发之后，判断一段协程代码好不好，我一般只问三个问题：

1. 它的父作用域是谁，生命周期跟谁绑定？
2. 取消它的时候，它真的会停下来吗？
3. 它失败了，应该影响谁？

这三个问题答得上来，基本就不会写出「页面关了请求还在跑」或者「一个接口超时整个页面白屏」了。
