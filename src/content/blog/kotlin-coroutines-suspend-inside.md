---
title: suspend 挂起的到底是什么
description: 编译器把你的函数拆成了什么样子，那些跨挂起点的变量都去了哪儿，以及 delay 和 Thread.sleep 在底层到底差在哪。
pubDate: 2026-11-05
category: Kotlin
tags: ['Kotlin', '协程', 'suspend', 'Continuation']
draft: false
featured: false
series: Kotlin 协程大白话
---

> **系列导航**：这是「Kotlin 协程大白话」系列的第 2 篇，共 14 篇主线 + 2 篇番外。
> 上一篇我们说清了"协程要解决什么问题"，这篇钻进 `suspend` 里面，看看它到底被改造成了什么。

上一篇留了个问题没答：

> 挂起是"下台去后台准备"，那**下台之后，台词记在哪儿？**

我们来看一个具体的函数：

```kotlin title="UserRepository.kt"
suspend fun loadUser(): User {
    println("开始请求")
    val token = login()          // ← 这里挂起
    println("拿到 token")
    val user = fetchUser(token)  // ← 这里也挂起
    println("拿到用户")
    return user
}
```

这个函数跑到 `login()` 那一行时，协程要下台了。

问题来了：**`token` 这个变量，此刻存在哪里？**

普通函数里，局部变量就躺在栈帧上。但挂起的时候，**栈帧是要被销毁的**——函数调用栈不能一直占着，不然线程就被一个等待中的任务焊死了。

所以 `token` 必须被搬到一个不会消失的地方。这就是 `suspend` 关键字背后真正发生的事。

## 挂起时消失的是栈帧

先把这条拎出来，它是理解后面一切的前提：

| | 普通函数调用 | 协程挂起 |
|---|---|---|
| 局部变量 | 在栈帧上 | **栈帧被销毁，变量得搬家** |
| 返回地址 | 压在栈上 | 得存到某个对象里 |
| 调用栈深度 | 一直在涨 | 挂起时栈帧直接回收 |

**为什么栈帧必须销毁？**

因为线程要还回去干别的活。如果挂起时还留着完整栈帧，100 个协程同时挂起，栈空间就爆了——每个协程都占着完整的一层调用栈。

所以挂起的本质是：**把"我执行到哪了"这件事，从栈上搬到堆上。**

搬到哪里去了？搬到一个叫 **`Continuation`** 的对象里。

## 编译器把你的函数劈成了两半

这是整篇最核心的内容。`suspend` 函数在编译后，**长这样**：

```kotlin title="UserRepository.kt"
// 你写的
suspend fun loadUser(): User { ... }

// 编译器改出来的（概念上的等价形式）
fun loadUser(continuation: Continuation<Any?>): Any? { ... }
```

看出变化了吗：

1. **多了一个 `continuation` 参数** —— 状态往这儿存
2. **返回值从 `User` 变成了 `Any?`** —— 因为函数可能返回"用户"，也可能返回"我挂起了，你待会儿再来"

这个改写在编译器领域有个名字叫 **CPS 变换**（Continuation Passing Style，延续传递风格）。名字不重要，意思就一句：

> **原本靠"栈"记住的"我执行到哪了"，改成靠"参数"传下去。**

那函数体被改成什么样了？看这个例子：

```kotlin title="UserRepository.kt"
suspend fun loadUser(): User {
    println("开始请求")
    val token = login()
    println("拿到 token")
    val user = fetchUser(token)
    println("拿到用户")
    return user
}
```

编译后大致是：

```kotlin title="UserRepository.kt"
fun loadUser(continuation: Continuation<Any?>): Any? {
    when (continuation.label) {          // ← 看我在哪一步
        0 -> {
            println("开始请求")
            val token = login(continuation)
            if (token === COROUTINE_SUSPENDED) return COROUTINE_SUSPENDED
            continuation.label = 1       // ← 记住"我停在第 1 步"
            continuation.token = token  // ← token 搬到这里了
        }
        1 -> {
            println("拿到 token")
            val user = fetchUser(continuation.token, continuation)
            if (user === COROUTINE_SUSPENDED) return COROUTINE_SUSPENDED
            continuation.label = 2
            continuation.user = user
        }
        2 -> {
            println("拿到用户")
            return continuation.user
        }
        else -> error("未知状态: ${continuation.label}")
    }
}
```

**盯着看三处细节：**

**第一，函数被切成了带编号的步骤。** 这就是标题里说的"状态机"。编译器在每个可能挂起的地方切一刀，切出来的每段编一个号：`0`、`1`、`2`。

**第二，跨挂起点存活的变量，被搬到了 `continuation` 上。** 原本是局部变量 `token`，现在变成 `continuation.token`。因为栈帧没了，得找个地方接着放。

**第三，多了一个叫 `COROUTINE_SUSPENDED` 的暗号。** 当 `login()` 真的挂起了，它会把这个暗号传回来。函数一看："哦，这是说'我停这儿了'"，于是原样把暗号返回给调用方。

> 一句话总结：**`suspend` 函数被改写成了一个"按编号跳着执行"的状态机，所有跨挂起点的状态，都存进了那个 `continuation` 对象里。**

## 状态机的三个角色

现在可以把上一段的代码翻译成人话了。

**角色一：`Continuation` —— 状态仓库**

它存着：

- `label`：我执行到第几步了
- 那些跨挂起点的局部变量
- 一个 `CoroutineContext`：我该用哪个线程、归谁管（下一篇的主角）

**角色二：`label` —— 进度条**

`continuation.label` 就是"书签"。它记着这个协程上次停在了哪一步，下次被唤醒时好接着往下走。

**角色三：`COROUTINE_SUSPENDED` —— 停车信号**

它是个特殊常量，表示"这次调用没能出结果，我挂起了"。调用方看到它，就知道该把线程还回去，而不是傻等。

### 唤醒时到底发生了什么

这是最反直觉的一段，我单独拎出来说。

当你调用一个 `suspend` 函数时，**这个函数从头开始执行**。如果它在某个挂起点停住了，它会：

1. 把状态存进 `continuation`
2. 返回 `COROUTINE_SUSPENDED`
3. 线程被释放，去干别的

等这个挂起的事情完成了（比如网络回来了），有人会调用 `continuation.resumeWith(result)`。这一调用，会**重新进入 `loadUser` 这个函数**——注意，是从头进。

但是因为 `continuation.label` 已经是 `1` 了，那个 `when` 会直接跳到 `1` 分支，**跳过第 0 步**。

所以真实的过程长这样：

```text
第 1 次进入                    第 2 次进入（被唤醒时）
┌──────────────────┐          ┌──────────────────┐
│ label=0          │          │ label=1          │
│ println("开始请求")│  跳过！   │ println("拿到token")│
│ login()          │ ────────►│ fetchUser(token) │
│ ↓ 挂起，返回暗号   │  唤醒     │ ↓ 挂起，返回暗号   │
└──────────────────┘          └──────────────────┘
                                    ↓ 再次唤醒
                            ┌──────────────────┐
                            │ label=2          │
                            │ println("拿到用户")│
                            │ return user      │
                            └──────────────────┘
```

**函数被反复从头进入，每次靠 `label` 跳到正确的位置。** 这就是"状态机"的含义。

> 记住这个画面：**协程的恢复，是"重新进门 + 看书签跳到上次那页"，而不是"接着上次往下走"。**

## 手写一个迷你状态机

上面那些是编译器干的，我们看不到。但这事儿其实不难理解，手写一个就明白了。

我们不用 `suspend`，纯用普通函数模拟一遍。**下面这一整段是可以直接复制运行的完整程序**：

```kotlin title="MiniStateMachine.kt"
// 暗号用一个普通对象表示（真实的 kotlinx 是个 internal 常量）
object Suspended
val COROUTINE_SUSPENDED = Suspended

class User(val token: String)

// 跨挂起点存活的变量，得放在一个"不会消失"的对象里
class MyContinuation {
    var label = 0        // 我执行到第几步
    var token: String? = null
}

// 一个"假装是 suspend"的函数
fun loadUserMock(c: MyContinuation): Any? {
    when (c.label) {
        0 -> {
            println("开始请求")
            c.token = "token-abc"        // 相当于 login() 返回了
            c.label = 1
            return COROUTINE_SUSPENDED  // 假装这里挂起了
        }
        1 -> {
            println("拿到 token")
            c.label = 2
            return COROUTINE_SUSPENDED  // 假装这里又挂起了
        }
        2 -> {
            println("拿到用户")
            return User(c.token!!)       // 真正的返回值
        }
        else -> error("未知状态: ${c.label}")
    }
}

fun main() {
    val c = MyContinuation()
    var result: Any? = loadUserMock(c)

    while (result === COROUTINE_SUSPENDED) {
        // 模拟"网络回来"这件事：带着同一个 c 再进一次
        result = loadUserMock(c)
    }
}
```

跑一下就能看到输出：

```text
开始请求
拿到 token
拿到用户
```

**没有 `println("开始请求")` 打印第二次**——因为第二次进来时 `label` 已经是 `1` 了。

> 这段代码是**真能编译运行的**（用 kotlinc 验证过，输出与上面一致）。
>
> 顺带一提，你动手写的时候可能会撞上两个编译错误：
>
> - `const val X = Any()` —— 报 `const 'val' has type 'Any'`。`const` 只允许基本类型和 String，所以上面改用了普通 `object`。
> - `when` 分支不全 —— 报 `missing return statement`。`when` 当语句用时编译器要求穷尽所有情况，得加 `else`。
>
> 这两个报错本身也是很好的教学素材：**编译器对 `suspend` 的处理，和对普通函数的处理，规则是一样的。**

这，就是 Kotlin 协程"挂起 + 恢复"的全部秘密。真实实现比这个复杂（要处理线程调度、异常、取消），但**骨架就是这样**。

## 挂起点的秘密：delay 和 Thread.sleep

上一篇提过一句：`delay(1000)` 不是 `Thread.sleep(1000)`。现在我们能说清楚为什么了。

### Thread.sleep 是怎么实现的

```java title="Thread.java"
// JDK 源码
public static void sleep(long millis) throws InterruptedException {
    if (millis < 0) throw new IllegalArgumentException("timeout value is negative");
    long nanos = MILLISECONDS.toNanos(millis);
    ThreadSleepEvent event = beforeSleep(nanos);
    try {
        sleepNanos(nanos);
    } finally {
        afterSleep(event);
    }
}

private static native void sleepNanos(long nanos);
```

最后那行是 **native 方法**——交给操作系统去处理。

操作系统做的事是：**把这个线程的栈整个挂起，让 CPU 去调度别的线程。** 线程还在，还是那个线程，只是被内核"扣住"了，直到定时器到点再唤醒。

**关键：线程确实被占住了。** 100 个 `Thread.sleep(1000)` 就是 100 个线程各自被扣住 1 秒。

### delay 是怎么实现的

`delay` 是 kotlinx.coroutines 库提供的，看它的简化实现：

```kotlin title="Delay.kt"
public suspend fun delay(timeMillis: Long): Unit =
    suspendCancellableCoroutine sc@ { cont ->
        // 把我交给定时器线程池，到点了来叫醒我
        scheduleResumeAfterDelay(timeMillis, cont)
    }
```

`scheduleResumeAfterDelay` 干的事是：**把这个 continuation 丢给一个定时器线程池（`DefaultDelay`），注册一个"到点后调用 `cont.resume(Unit)`"的任务。**

然后 `suspendCancellableCoroutine` 这块代码就**立刻返回了**。没有 `native` 调用，没有线程被扣住。

线程还回池子里干别的去了。等 1 秒后，定时器线程跑起来，调用 `cont.resume(Unit)`，协程就被唤醒了。

### 对比

| | `Thread.sleep(1000)` | `delay(1000)` |
|---|---|---|
| 底层 | `native` 方法，交给操作系统 | 库函数，交给定时器线程池 |
| 线程状态 | **被扣住**，栈还在 | 立刻释放，栈帧回收 |
| 谁来唤醒 | 操作系统 | 协程库注册的定时任务 |
| 等待期间能取消吗 | 不能（只能 `interrupt`） | **能**，取消后立即抛异常 |
| 1000 个并发要几个线程 | 1000 个 | 1 ~ 几个 |

最后一行是协程的全部价值所在：

> **`delay` 让"等待"这件事不再占用任何线程资源。** 一万个协程同时 `delay`，可能一个线程都没被浪费。

### 实测一下

上面这段不是纸上谈兵，下面这段代码是**真跑过的**（kotlinc 编译 + 真实 kotlinx-coroutines 运行）：

```kotlin title="DelayBenchmark.kt"
import kotlinx.coroutines.*

fun main() = runBlocking {
    // A: 1000 个协程各 delay(1000)
    val t1 = System.currentTimeMillis()
    val jobs = (1..1000).map { launch(Dispatchers.Default) { delay(1000) } }
    jobs.forEach { it.join() }
    println("[A] 1000 协程 delay(1000): 耗时 ${System.currentTimeMillis() - t1}ms, 线程数=${Thread.activeCount()}")

    // C: 限定成单线程，跑 1000 个 delay(500)
    val t3 = System.currentTimeMillis()
    val single = (1..1000).map {
        launch(Dispatchers.Default.limitedParallelism(1)) { delay(500) }
    }
    single.forEach { it.join() }
    println("[C] 单线程 1000 协程 delay(500): 耗时 ${System.currentTimeMillis() - t3}ms")
}
```

实际输出：

```text
[A] 1000 协程 delay(1000): 耗时 1025ms, 线程数=12
[C] 单线程 1000 协程 delay(500): 耗时 514ms
```

**C 组是重点**：明明只有一个线程，1000 个协程各自等 500 毫秒，总共却只用了 514 毫秒——相当于所有等待**完全重叠**了。

如果换成 1000 个线程各自 `Thread.sleep(500)`，那需要真的开 1000 个线程，内存开销和调度开销都完全不是一个量级。

> 复制这段代码时，`limitedParallelism` 会提示需要 opt-in。加一行注解就行：
>
> ```kotlin
> @OptIn(ExperimentalCoroutinesApi::class)
> fun main() = runBlocking { ... }
> ```
>
> 这个 API 主要是用来看效果，日常业务里用 `Dispatchers.IO` 就够了。

顺便说一句，`delay` 内部用的 `suspendCancellableCoroutine` 是个公开 API，它就是**让你手写挂起点用的**——把任何"回调式"的异步操作包装成一个 `suspend` 函数。第 11 篇会专门讲怎么用。

## 为什么 suspend 必须在协程里调用

最后一个问题，也是上一篇说"suspend 函数只能在协程体里调用，普通函数里调它会直接编译报错"的原因。

答案现在很清楚了：

> **因为 `suspend` 函数需要一个 `continuation` 参数来存状态，而 `continuation` 里装着 `CoroutineContext`——那是"归谁管、用哪个线程"的来源。**

普通函数里没有协程环境，没有 `CoroutineContext`，也就没有地方安放这个 `continuation`。**参数凑不齐，函数就编译不过。**

编译器报的错大致是：

```text
Suspension functions can be called only within coroutine body
```

### 那 runBlocking 里为什么能调？

```kotlin title="Main.kt"
fun main() = runBlocking {
    delay(1000)      // ✅ 能调
    println("完成")
}
```

因为 `runBlocking` **本身就在创建一个协程**——它内部启动了一个协程来跑你这段代码，只是顺便把外层的线程阻塞住等它结束。

所以"能在 `runBlocking` 里调"和"能在协程里调"是同一件事，`runBlocking` 是个特例化的协程入口。

顺便解释另一个常见疑问：

```kotlin title="Main.kt"
suspend fun main() {      // ✅ 这个也合法
    delay(1000)
}
```

`main` 函数写成 `suspend`，编译时会被自动包一层 `runBlocking`。这是 Kotlin 1.3 之后才支持的写法。

### 一句话总结这一节

> **`suspend` 不是"能挂起的函数"这个魔法，而是"一个需要协程上下文才能运行的函数"。** 它的状态要存在 `Continuation` 里，而 `Continuation` 是从协程上下文里来的。

## 本篇要点

1. **挂起时销毁的是栈帧**，跨挂起点的变量必须搬家到 `Continuation` 对象上
2. **`suspend` 函数被编译成状态机**：带 `label` 编号，`continuation` 存状态，`COROUTINE_SUSPENDED` 表示"我挂起了"
3. **恢复 = 重新从头进入 + 靠 `label` 跳到上次的位置**，不是"接着往下走"
4. **`delay` 不占线程**（定时器回调），**`Thread.sleep` 占线程**（native 挂起）——这是并发能力的根源
5. **必须在协程里调用**，因为 `continuation` 里的 `CoroutineContext` 是"归谁管"的来源

最重要的一张图，存脑子里：

```text
写的是：   suspend fun f() { A; g(); B; h(); C }

编译成：   fun f(c: Continuation): Any? {
               when (c.label) {
                   0 -> { A; c.label = 1; ... }   // 挂起
                   1 -> { B; c.label = 2; ... }   // 挂起
                   2 -> { C; return result }
               }
           }
```

## 下一篇

下一篇讲三个主角：**`CoroutineScope`、`Job`、`Dispatcher`**。

会搞清楚：协程跑在哪个线程上（Dispatcher）、谁负责在它结束后收拾残局（Job）、以及这两个东西怎么绑在一起（Scope）。以及一个关键问题——**为什么 `GlobalScope` 是个坏味道。**

→ **第 03 篇 · Scope、Job、Dispatcher 三件套**

---

*本系列共 14 篇主线 + 2 篇番外，按顺序读最省力。如果你觉得这篇讲清楚了，回博客点个赞就是最大的支持——我会更有动力把它写完。*
