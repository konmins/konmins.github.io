---
title: Kotlin 冷流与热流：区别、实现方式，以及什么时候该用哪个
description: 从「同一个 Flow 被两处收集，接口却被请求了两次」说起，讲清冷流与热流的本质区别、底层实现（SafeCollector、缓冲与 replay），以及 shareIn / stateIn 的三种启动策略怎么选。
pubDate: 2026-09-22
category: Kotlin
tags: ['Kotlin', 'Flow', '协程', '响应式', 'Android']
---

这个 bug 我见过不止一次：ViewModel 里暴露了一个 Flow，页面上两个地方 collect 它，结果接口被调了两次，日志里两条一模一样的请求挨着出现。

```kotlin title="UserRepository.kt"
// 看起来人畜无害
fun observeUser(id: String): Flow<User> = flow {
    emit(api.fetchUser(id))
}
```

问题不在 `flow { }` 写错了，而在于**它是一个冷流**——每次被收集，那个代码块都会从头再跑一遍。

这篇把冷流和热流的区别、各自的实现方式，以及最容易踩的坑一次讲清楚。

## 冷流：一份说明书，不是一条数据流

`flow { }` 创建的 Flow 实例，本质上是**一段可复用的执行描述**，而不是一条已经存在的数据流。它自己不持有任何数据，也不占用任何协程。

```kotlin title="ColdDemo.kt"
fun numbers(): Flow<Int> = flow {
    println("  [上游] 启动")
    for (i in 1..3) {
        delay(50)
        emit(i)
    }
}

fun main() = runBlocking {
    val flow = numbers()

    println("创建完成，此时上游还没有运行")

    flow.collect { println("  收集者 A: $it") }
    flow.collect { println("  收集者 B: $it") }
}
```

输出是：

```text
创建完成，此时上游还没有运行
  [上游] 启动
  收集者 A: 1
  收集者 A: 2
  收集者 A: 3
  [上游] 启动        ← 上游又跑了一遍
  收集者 B: 1
  收集者 B: 2
  收集者 B: 3
```

三件事同时被证明了：

1. **`flow { }` 的代码块在 `collect` 之前一行都不执行**；
2. **每个收集者都触发一次独立执行**，A 和 B 拿到的是两条互不相干的数据流；
3. **冷流是单播的**，它没有「广播」的概念。

这也解释了一个常见困惑：为什么把一个 `flow { }` 赋值给变量，只创建一次，却会被执行多次？因为变量里存的是说明书，每次 `collect` 才是「照着说明书生产一次」。

### 实现：为什么不能在别的协程里 emit

冷流有个硬性约束，很多人是被报错教育过的：

```kotlin title="Broken.kt"
fun broken(): Flow<Int> = flow {
    launch {
        emit(1) // [!code error]
    }
}
```

运行会直接抛异常：

```text
IllegalStateException: Flow invariant is violated:
    Emission from another coroutine is detected.
```

原因是 `flow { }` 的代码块里，`this` 是一个 `SafeCollector`。它把「当前协程」和「收集者的上下文」都记了下来，每次 `emit` 都要校验上下文没变。这是为了保证一个很实用的承诺：

> **`flow { }` 里的代码默认就是顺序、可预期的**，不需要担心挂起点被别的协程插进来。

如果确实需要切换线程或并发，正确的做法是 `flowOn` 或 `channelFlow`，而不是自己 `launch`：

```kotlin title="Fixed.kt"
fun onIo(): Flow<Int> = flow {
    emit(1)
    emit(2)
}.flowOn(Dispatchers.IO) // [!code highlight]
```

`flowOn` 的实现方式值得一提：它并不是简单地切一下调度器，而是**把上游整体搬到一个新的协程里执行，中间用一个 channel 把数据传回来**（内部是 `ChannelFlow`）。这带来两个实际影响：

- `flowOn` 只影响它**上面**的操作符，写在它下面的 `map`、`filter` 依然跑在收集者的上下文里；
- 因为有 channel，所以 `flowOn` 之后 `buffer` 的容量会影响背压行为。

## 热流：数据源先于订阅者存在

热流反过来：它**本身就是一个长期存在的数据源**，有没有人收集都不影响它工作。`StateFlow` 和 `SharedFlow` 是两个代表作。

```kotlin title="HotDemo.kt"
fun main() = runBlocking {
    val hot = MutableSharedFlow<Int>(replay = 1)

    // 先发射，此时还没有任何订阅者
    hot.emit(1)

    // 后订阅，靠 replay 拿到刚才那个值
    hot.collect { println("收集者: $it") }
}
```

冷流做不到这件事——没有收集者的时候，它连起点都不存在。

### StateFlow：replay 为 1、且按相等性去重

`StateFlow` 是 `SharedFlow` 的特化版本，可以拆成三条规则：

- **永远有一个当前值**，构造时必须给初值，且可以随时通过 `.value` 同步读取；
- **等价于 `replay = 1`**，任何新订阅者立刻收到当前值；
- **用 `equals` 做 conflation**，官方文档的原话是「类似 `distinctUntilChanged`」。

第三条最容易被忽略：

```kotlin title="StateFlowConflation.kt"
val state = MutableStateFlow(0)

state.value = 0 // [!code --]
state.value = 1 // [!code ++]
state.value = 1 // [!code ++]
```

把值设成和当前相等的值，**不会产生新的发射**。这在多数场景下是好事（避免无意义的 UI 重组），但如果你想用 StateFlow 传「一次性事件」，就会出问题——两次相同的点击事件只有第一次能被收到。后面「坑」那一节会展开。

### SharedFlow：可配置的缓冲模型

`SharedFlow` 没有初值，也不做去重，它的行为由三个参数决定：

```kotlin
MutableSharedFlow(
    replay = 0,                          // 新订阅者能收到几条历史值
    extraBufferCapacity = 0,             // replay 之外还能缓冲几条
    onBufferOverflow = BufferOverflow.SUSPEND, // 缓冲满时的策略
)
```

关键在于**总缓冲容量 = `replay + extraBufferCapacity`**，而容量为 0 时行为很反直觉：

| 配置 | 没有订阅者时 emit | 有慢订阅者时 emit |
| --- | --- | --- |
| `replay = 0, extra = 0`（默认） | 不挂起，**值被直接丢弃** | 挂起，直到所有订阅者都收到 |
| `replay = 0, extra = 1` | 不挂起，值进缓冲 | 缓冲满后挂起 |
| `replay = 1` | 值进 replay 缓存 | 同上，且新订阅者能收到 |

默认配置（两个都为 0）常被称为 rendezvous 模式：**它不缓存任何东西**。没人订阅就等于没发生，有订阅者则必须所有人消费完 `emit` 才能返回。

还有一条约束容易踩：`DROP_OLDEST` / `DROP_LATEST` 要求总容量大于 0，否则构造时就抛异常：

```kotlin title="IllegalArgumentException.kt"
// ❌ 抛 IllegalArgumentException：
//    replay or extraBufferCapacity must be positive with non-default onBufferOverflow strategy
MutableSharedFlow<Int>(onBufferOverflow = BufferOverflow.DROP_OLDEST)

// ✅ 想要「只保留最新值」，让 extraBufferCapacity 占住位置
MutableSharedFlow<Int>(extraBufferCapacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)
```

顺带一提，`conflate()` 的等价写法就是 `buffer(capacity = 0, onBufferOverflow = DROP_OLDEST)`，而 SharedFlow 想实现同样的「只保留最新」，就得靠上面那种配置。

## 一张对比表

| | 冷流 `Flow` | 热流 `SharedFlow` / `StateFlow` |
| --- | --- | --- |
| 上游启动时机 | 被 `collect` 时 | 创建（或 `shareIn` 启动）时 |
| 多个收集者 | 各跑一遍，互不影响 | 共享同一份数据 |
| 无人收集时 | 完全静止，不占资源 | 依然存活（是否工作取决于启动策略） |
| 广播能力 | 单播 | 多播 |
| 是否有初值 | 无 | `StateFlow` 有，`SharedFlow` 无 |
| 相等性去重 | 无（除非显式 `distinctUntilChanged`） | `StateFlow` 有，`SharedFlow` 无 |
| 背压 | 天然支持，靠挂起 | 靠缓冲容量配置 |
| `collect` 会结束吗 | 会（上游完成后正常返回） | 不会（只能被取消） |
| 典型用途 | 一次性的数据加载、转换管道 | UI 状态、事件总线、共享数据源 |

## 冷变热：shareIn 和 stateIn

实际项目里很少直接手写 `MutableSharedFlow`，更常见的做法是把一个冷流「共享」出去：

```kotlin title="ShareIn.kt"
class UserViewModel(
    private val repo: UserRepository,
    scope: CoroutineScope,
) {
    // 冷流 → 热流
    val user: StateFlow<User?> = repo.observeUser("42")
        .stateIn(
            scope = scope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = null,
        )
}
```

它的内部实现思路很直白：**创建一个 `MutableSharedFlow`，再起一个协程把上游的值转发进去**。`stateIn` 相当于 `shareIn` 再加上「有初值」和「相等性去重」。

所以共享之后：

- 上游只执行**一次**，无论下游有几个收集者；
- 上游的启动/停止由 `started` 参数控制；
- 收集者拿到的是热流，没有订阅者时上游可能已经被停掉了。

### 三种启动策略

| 策略 | 上游何时启动 | 上游何时停止 | 适用场景 |
| --- | --- | --- | --- |
| `Eagerly` | 立即（`shareIn` 调用时） | 随 scope 结束 | 数据必须常驻、不能等订阅者 |
| `Lazily` | 第一个订阅者出现时 | **永不**，随 scope 结束 | 只想要「只启动一次」，不关心释放 |
| `WhileSubscribed(5_000)` | 第一个订阅者出现时 | **最后一个订阅者离开 5 秒后** | 页面级数据，最常用 |

`WhileSubscribed` 那两个参数值得记一下：

```kotlin
SharingStarted.WhileSubscribed(
    stopTimeoutMillis = 5_000,            // 最后一个订阅者离开后，等多久再停上游
    replayExpirationMillis = Long.MAX_VALUE, // 停了之后，replay 缓存保留多久
)
```

`stopTimeoutMillis = 5_000` 是 Android 上很实用的一个经验值：**屏幕旋转**时 Activity 被销毁重建，中间的空窗期通常不到 5 秒。给 5 秒缓冲，上游不会被停掉又重启，用户不会看到一次多余的 loading。

`Lazily` 常被误用。它的语义是「第一次有人订阅就启动，然后永远不停」——如果你的上游是一个一直往下推数据的 WebSocket，用 `Lazily` 就会在页面退出后还开着。

## 实战：ViewModel 里的标准写法

把上面这些拼起来，Android 上的推荐形态大致是这样：

```kotlin title="FeedViewModel.kt"
class FeedViewModel(
    private val repo: FeedRepository,
) : ViewModel() {

    private val refreshTrigger = MutableSharedFlow<Unit>(replay = 1) // [!code highlight]

    val uiState: StateFlow<FeedUiState> = refreshTrigger
        .onStart { emit(Unit) }              // 首次进入自动加载一次
        .flatMapLatest { repo.loadFeed() }   // 新的刷新事件会取消上一次请求
        .map { FeedUiState.Content(it) }
        .catch { emit(FeedUiState.Error(it)) }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000), // [!code highlight]
            initialValue = FeedUiState.Loading,
        )

    fun refresh() {
        refreshTrigger.tryEmit(Unit)
    }
}
```

几个设计点：

- **状态用 `StateFlow`**：有初值、可同步读、自动去重，天然适合 UI；
- **触发源用 `SharedFlow`**（这里 `replay = 1` 是为了让晚订阅的 `onStart` 也能拿到一次），而不是用 StateFlow 传事件；
- **`flatMapLatest`** 保证刷新时旧请求被取消，不会出现后发先至的竞态；
- **`stateIn(WhileSubscribed(5_000))`** 让页面不可见时停止上游，但容忍短暂的配置变更。

## 五个高频的坑

**① 用 StateFlow 当一次性事件总线**

```kotlin
// ❌ replay = 1 意味着新订阅者会收到「上一次的事件」
private val _toast = MutableStateFlow<String?>(null)
val toast: StateFlow<String?> = _toast
```

旋转屏幕后重订阅，上一次的 Toast 又弹了一次；而且两次相同内容的事件（比如「保存成功」连点两次）只会收到一次。一次性事件应该用 `Channel` 或 `MutableSharedFlow(replay = 0, extraBufferCapacity = 1)`。

**② 仓库里暴露冷流，被多处收集**

就是开头那个 bug。只要同一个冷流被 N 个地方收集，上游就跑 N 次。在 Repository 层暴露数据时，要么明确它是冷流（并在文档里写清楚），要么在 ViewModel 层统一 `stateIn` 之后往外给。

**③ `stateIn` 的 `started` 传了 `Lazily`，但期望它能停**

`Lazily` 一旦启动就不会停。要「没人看就停」必须用 `WhileSubscribed`。

**④ 默认的 `MutableSharedFlow` 会阻塞发射方**

`replay = 0, extraBufferCapacity = 0` 是 rendezvous 模式，任何一个慢订阅者都会把 `emit` 卡住。如果发射方不能等（比如在 UI 回调里），要么加 `extraBufferCapacity`，要么用 `tryEmit` —— 但注意 `tryEmit` 返回 `false` 时**值会被丢掉**，事件类场景更推荐 `Channel(BUFFERED)`。

**⑤ `shareIn` 的 scope 传错**

```kotlin
// ❌ 用 GlobalScope，上游永不释放
repo.observeUser(id).shareIn(GlobalScope, SharingStarted.Lazily, 1)

// ✅ 绑到有生命周期的 scope
repo.observeUser(id).shareIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 1)
```

## 怎么选

最后给一个我自己的判断顺序：

1. **需要「谁收集谁触发、每次都是新的」** → 冷流 `flow { }`。数据加载、转换管道、数据库查询都属于这一类。
2. **需要「一份数据给多个消费者」** → 热流。这是冷流做不到的事。
3. **对外暴露状态** → `StateFlow`（有初值 + 去重 + 同步可读）。
4. **对外暴露事件** → `SharedFlow(replay = 0, extraBufferCapacity = 1)` 或 `Channel`。
5. **在中间做转换** → 用 `stateIn` / `shareIn` 把冷流转热，`started` 默认选 `WhileSubscribed(5_000)`。

一句话总结区别：**冷流是「每次订阅都重新生产」，热流是「先生产好，订阅者接入已有数据流」。** 理解这一条，上面大部分坑都能自己推出来。
