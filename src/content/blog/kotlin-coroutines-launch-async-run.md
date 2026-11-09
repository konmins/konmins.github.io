---
title: launch、async、run 到底怎么选
description: 三个函数长得像，用错一个就出事。重点讲清 async 忘了 await 时异常会去哪，以及为什么「await 了还 try/catch 了」作用域照样会失败。全文附实测数据。
pubDate: 2026-11-09
category: Kotlin
tags: ['Kotlin', '协程', 'launch', 'async', 'Deferred', '异常处理']
---

上一篇讲完三件套，你已经知道协程跑在哪个线程、归谁管了。

现在该解决一个更具体的问题：**我想跑一段异步的活儿，该调哪个函数？**

`launch`、`async`、`run` 三个都长得差不多，都能"跑一段代码"。但选错了——尤其是 `async`——代码能编译、能跑，错误却**人间蒸发**。

这篇就把这三个函数掰开讲清楚。全文的结论都有实测支撑，代码可以直接复制跑。

## 先把三个函数摆一起

```kotlin title="Api.kt"
import kotlinx.coroutines.*

// 1. launch：只要"做了"，不要"结果"
val job: Job = launch { doSomething() }

// 2. async：要"结果"，而且你得负责去拿
val deferred: Deferred<String> = async { fetchData() }

// 3. run：普通函数，同步跑完才返回
val result: String = run { compute() }
```

区别不在于「能不能挂起」，而在于**返回什么**：

| | 返回类型 | 要结果吗 | 谁来取 |
|---|---|---|---|
| `launch` | `Job` | 不要 | 不用管 |
| `async` | `Deferred<T>` | 要 | **必须 await** |
| `run` | `T` | 要 | 直接拿 |

实测一下三者的真实返回类型：

```text
H launch -> StandaloneCoroutine
H async  -> DeferredCoroutine
H run    -> String
```

`StandaloneCoroutine` 是 `Job` 的实现，`DeferredCoroutine` 是 `Deferred` 的实现——它们是**两个不同的类型**，`Deferred` 是 `Job` 的子接口，多了一个 `await()`。

### `run` 根本不是"启动协程"

这是最容易搞混的地方。`run` 是 **Kotlin 标准库**的函数（`kotlin.run`），不是协程库里的。它就是一个普通的 `inline` 函数：

```kotlin title="RunDemo.kt"
fun main() {
    val t0 = System.currentTimeMillis()
    val v = run {
        Thread.sleep(300)
        "run 返回的值"
    }
    println("run 返回: $v，耗时 ${System.currentTimeMillis() - t0}ms")
    println("线程名 = ${Thread.currentThread().name}")
}
```

输出：

```text
I run 返回: run 返回的值，耗时 303ms（当前线程被卡住）
I 线程名 = main
```

**当前线程被卡住了 303 毫秒。** `run` 不会创建协程，不会切换线程，它就是在你当前线程上同步执行一段代码。

真正会阻塞的、协程库里那个叫 **`runBlocking`**：

```kotlin title="RunBlockingDemo.kt"
import kotlinx.coroutines.*

fun main() = runBlocking {          // 阻塞当前线程，直到里面跑完
    println("线程名 = ${Thread.currentThread().name}")
}
```

`runBlocking` 存在的意义是给 `main()` 函数用的——`main` 不能是挂起函数。而 `run` 只是普通代码块，跟协程一点关系都没有。

> 顺带说一句：**在协程里基本不该用 `run`**。它不切换线程，你以为在协程里跑、其实还在当前线程上阻塞着。`runBlocking` 更不能出现在协程内部——那会直接把调用线程卡死。

## launch：只管"做了"

`launch` 返回一个 `Job`，代表"这件事我交给协程了"。你不需要它的返回值，也不需要等它。

```kotlin title="LaunchDemo.kt"
import kotlinx.coroutines.*

fun main() = runBlocking {
    val job = launch {
        delay(100)
        println("干完了")
    }
    println("协程已经启动，但还没干完")
    job.join()          // 想等的话，用 join()
    println("现在肯定干完了")
}
```

什么时候用 `launch`：

- 触发一个动作，不关心结果（上报埋点、写日志、刷新缓存）
- 并行做几件互不相干的事
- 需要返回 `Job` 传给别的地方管理

**注意 `launch` 里的异常**：`launch` 内部直接抛异常，这个异常会**取消整个父作用域**，最终由 `CoroutineExceptionHandler` 接手（没设 handler 的话，在 Android 上就是崩溃，在 JVM 上是打到 stderr）。

```kotlin title="LaunchException.kt"
import kotlinx.coroutines.*

fun main() {
    val handler = CoroutineExceptionHandler { _, e ->
        println("G CoroutineExceptionHandler 收到: ${e::class.simpleName}: ${e.message}")
    }
    val scope = CoroutineScope(Dispatchers.Default + handler)
    scope.launch { throw IllegalStateException("G-boom") }
    Thread.sleep(400)
}
```

输出：

```text
G CoroutineExceptionHandler 收到: IllegalStateException: G-boom
```

这就是"子协程失败 → 取消父协程"这条规则。后面讲 `async` 的时候你会再遇到它。

## async：要结果，就得负责拿

`async` 和 `launch` 的区别只有一个：**它会产出一个结果**。

```kotlin title="AsyncDemo.kt"
import kotlinx.coroutines.*

fun main() = runBlocking {
    val deferred = async {
        delay(100)
        "查询结果"
    }
    println("先做点别的")
    println("结果: ${deferred.await()}")
}
```

`await()` 有两个作用：

1. **等结果**——挂起直到 `Deferred` 完成
2. **把异常重新抛出来**——如果 `async` 内部抛了异常，`await()` 会在这一刻把它抛给你

第 2 点是这篇文章的重点。

## 坑：async 忘了 await，异常去哪了

先看一段看起来很正常的代码：

```kotlin title="ForgotAwait.kt"
import kotlinx.coroutines.*

fun main() = runBlocking {
    val d = async { throw IllegalStateException("A-boom") }
    delay(200)
    println("d.isCompleted=${d.isCompleted}")
}
```

直觉上你会以为：异常要么崩了，要么至少打印出来了。

**都没有。** 实测输出：

```text
A 从作用域里抛出了: IllegalStateException: A-boom
```

异常确实冒出来了——但**它不是从 `async` 里冒出来的，而是取消了整个 `runBlocking` 作用域**，最后从作用域的边界抛了出去。

注意 `println("d.isCompleted=...")` 那行**根本没执行**。异常发生的瞬间，父作用域就被取消了。

这件事的关键在于：**异常传播和 `await` 没关系。**

`await` 只决定「你能不能亲手接到这个异常」，而不是「异常会不会传播」。

那什么时候会真的静默？取决于你用的是什么作用域。三个场景实测如下：

```kotlin title="SilentCases.kt"
import kotlinx.coroutines.*

fun main() {
    // 场景 B：supervisorScope 里的 async 不 await
    runBlocking {
        supervisorScope {
            val d = async { throw IllegalStateException("B-boom") }
            delay(200)
            println("B 主流程跑完了 d.isCompleted=${d.isCompleted}")
        }
    }

    // 场景 D2：supervisorJob 的独立 scope 里 async 不 await
    val handler = CoroutineExceptionHandler { _, e ->
        println("D2 Handler 收到: ${e::class.simpleName}: ${e.message}")
    }
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default + handler)
    scope.launch {
        async { throw IllegalStateException("D2-boom") }   // 忘了 await
    }
    Thread.sleep(500)
    println("D2 主流程毫发无损，业务代码里一个 try/catch 都没写")
}
```

输出：

```text
===== B. supervisorScope + async 不 await =====
B 主流程跑完了 d.isCompleted=true
B 异常没有冒泡，主流程毫发无损
B supervisorScope 正常结束

===== D2. supervisorJob scope + async 不 await（显式 handler）=====
D2 Handler 收到: IllegalStateException: D2-boom
D2 主流程毫发无损，业务代码里一个 try/catch 都没写
```

看明白了：

| 场景 | 异常去向 | 业务代码感知得到吗 |
|---|---|---|
| 普通 `coroutineScope` / `runBlocking` | 取消父作用域，从作用域边界抛出 | 感知得到，但**兄弟协程被连坐** |
| `supervisorScope` | 存在 `Deferred` 里，不冒泡 | **完全感知不到**（除非你去 await） |
| `SupervisorJob()` 的独立 scope | 交给 `CoroutineExceptionHandler` | 业务代码感知不到，只在日志里 |

**`supervisorScope` 那一行是真正的"静默"**——异常既没取消谁，也没抛给谁，就躺在那个 `Deferred` 里，而这个 `Deferred` 你再也没碰过了。它跟随着作用域一起被回收，**连日志都不会留下一条**。

而第三种场景（`SupervisorJob` 的独立 scope）稍好一点，但如果你没设 `CoroutineExceptionHandler`，默认行为是打到 stderr：

```text
Exception in thread "DefaultDispatcher-worker-2" java.lang.IllegalStateException: D3-boom
	at Launch_async_runKt$scenarioD3$1$1.invokeSuspend(...)
```

在 Android 上，Android 自己的默认处理器会让**整个 App 崩掉**。

所以「忘了 await」的完整后果是：

1. 异常不会进入你的 `try/catch`
2. 异常可能连日志都没有
3. 更糟的是，**你可能还以为请求成功了**

## 更狠的：await 了、try/catch 了，作用域还是失败

上面那个坑已经够坑了。但还有一个更反直觉的。

你可能会想：那我确保 `await` 总有，并且包一层 `try/catch` 总行了吧？

试试这个：

```kotlin title="AwaitStillFails.kt"
import kotlinx.coroutines.*

fun main() = runBlocking {
    try {
        coroutineScope {
            val d = async { throw IllegalStateException("E-boom") }
            try {
                d.await()
            } catch (e: Exception) {
                println("E 业务代码捕获到了: ${e::class.simpleName}: ${e.message}")
            }
            delay(100)
            println("E 业务代码继续往下跑")
        }
        println("E coroutineScope 正常结束")
    } catch (e: Exception) {
        println("E 但 coroutineScope 本身还是失败了: ${e::class.simpleName}: ${e.message}")
    }
}
```

输出：

```text
E 业务代码捕获到了: IllegalStateException: E-boom
E 但 coroutineScope 本身还是失败了: IllegalStateException: E-boom
```

三个信息缺一不可：

1. 你的 `try/catch` **确实抓到了**异常——业务代码层面看，一切正常
2. 但 **`coroutineScope` 本身还是失败了**——那句「业务代码继续往下跑」和「coroutineScope 正常结束」**都没打印**
3. 异常从作用域边界又抛了一次，被外层捕获

为什么会这样？

因为**异常发生的那一刻，父作用域就已经被取消了**。`async` 内部抛出异常 → 它作为子协程失败 → 按结构化并发的规则取消父 `Job`。等你写 `await()` 时，异常只是被**重新抛出来**给你看，但父作用域的状态早就改了。

`await` 能让异常"可见"，但**没有能力把它撤回**。

那正确写法是什么？把 `coroutineScope` 换成 `supervisorScope`：

```kotlin title="SupervisorFix.kt"
import kotlinx.coroutines.*

fun main() = runBlocking {
    supervisorScope {
        val d = async { throw IllegalStateException("E2-boom") }
        try {
            d.await()
        } catch (e: Exception) {
            println("E2 业务代码捕获到了: ${e::class.simpleName}: ${e.message}")
        }
        delay(100)
        println("E2 业务代码继续往下跑")
    }
    println("E2 supervisorScope 正常结束")
}
```

输出：

```text
E2 业务代码捕获到了: IllegalStateException: E2-boom
E2 业务代码继续往下跑
E2 supervisorScope 正常结束
```

**这才是"我处理了这个错误，其他事情继续"的正确语义。**

## 真实场景：并行请求，一个失败连坐另一个

上面这些是玩具例子。来看真的：同时发两个接口请求。

```kotlin title="ParallelRequests.kt"
import kotlinx.coroutines.*

suspend fun good() = "成功的请求"
suspend fun bad(): String { throw IllegalStateException("坏的请求") }

fun main() = runBlocking {
    try {
        coroutineScope {
            val ok = async { delay(300); good() }
            val bad = async { delay(100); bad() }
            println("等 ok 的结果: ${ok.await()}")
        }
        println("整组正常结束")
    } catch (e: Exception) {
        println("J 整组失败: ${e::class.simpleName}: ${e.message}")
    }
}
```

输出：

```text
J 整组失败: IllegalStateException: 坏的请求
```

`ok` 那个请求明明 300ms 后就能成功返回，但它被连坐了——`bad` 失败 → 父作用域取消 → `ok` 被取消 → `ok.await()` 抛异常 → 整组失败。

**一个不相关的请求失败，把另一个成功的请求也干掉了。** 这在真实项目里非常常见：首页同时拉用户信息和 Banner，其中 Banner 接口 500 了，用户信息也没了。

换成 `supervisorScope`：

```kotlin title="ParallelFixed.kt"
import kotlinx.coroutines.*

fun main() = runBlocking {
    supervisorScope {
        val ok = async { delay(300); "成功的请求" }
        val bad = async { delay(100); throw IllegalStateException("坏的请求") }
        try {
            println("J2 等 ok 的结果: ${ok.await()}")
        } catch (e: Exception) {
            println("J2 ok 失败了: ${e::class.simpleName}: ${e.message}")
        }
        try {
            println("J2 等 bad 的结果: ${bad.await()}")
        } catch (e: Exception) {
            println("J2 bad 失败了: ${e::class.simpleName}: ${e.message}")
        }
    }
    println("J2 supervisorScope 正常结束")
}
```

输出：

```text
J2 等 ok 的结果: 成功的请求
J2 bad 失败了: IllegalStateException: 坏的请求
J2 supervisorScope 正常结束
```

**该成功的成功，该失败的单独失败。** 这才是并行请求应有的语义。

## 那到底怎么选

一张表收尾：

| 你的需求 | 用什么 | 注意 |
|---|---|---|
| 触发一个动作，不要结果 | `launch` | 异常会取消父作用域 |
| 要一个结果 | `async` + `await` | **必须 await** |
| 几个请求并行，**一个失败全部放弃** | `coroutineScope` + `async` | 默认行为 |
| 几个请求并行，**互不连坐** | `supervisorScope` + `async` | 每个都要单独 `await` / `try-catch` |
| 在主线程调一个挂起函数 | `runBlocking` | 会阻塞线程，别在协程里用 |
| 同步算个值 | `run` | 普通函数，跟协程无关 |

三条铁律：

1. **`async` 必须有 `await`。** 忘了 await 不是"没取到结果"，是"异常处置失败"。
2. **想隔离错误，就用 `supervisorScope`。** `try/catch` 只能让你看见异常，不能阻止它取消父作用域。
3. **`launch` 里想接住异常，就得自己 `try/catch`。** 别指望外层的 `try/catch` 能跨协程边界捞到它——

```kotlin title="LaunchCatch.kt"
import kotlinx.coroutines.*

fun main() = runBlocking {
    try {
        launch { throw IllegalStateException("F-boom") }
    } catch (e: Exception) {
        println("外层能抓到吗？")
    }
}
```

这段代码的外层 `try/catch` **抓不到**。`launch` 的异常发生在另一个协程里，抛出时父作用域已经被取消了，你这个 `try/catch` 拦不住。正确写法是在 `launch` **内部** catch：

```kotlin title="LaunchCatchFixed.kt"
import kotlinx.coroutines.*

fun main() = runBlocking {
    launch {
        try {
            throw IllegalStateException("F-boom")
        } catch (e: Exception) {
            println("F 在协程内部捕获到了: ${e::class.simpleName}: ${e.message}")
        }
    }.join()
}
```

或者干脆用 `async` + `await`，让异常在你能控制的地方重新冒出来。

---

下一篇我们讲**取消**：为什么点了返回键，请求还在跑；`cancel()` 到底做了什么；以及为什么 `Thread.sleep` 停不下来但 `delay` 能停。

（另：站内已有一篇《结构化并发：为什么不该再用 GlobalScope》，讲的是协程树、父子关系三条规则和 `supervisorScope` 的用法，跟这篇互补，可以对照看。）
