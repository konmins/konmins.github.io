---
title: 协程到底是个什么东西
description: 从三层嵌套的回调说起，讲清 Kotlin 协程到底要解决什么问题、它和线程的区别，以及"挂起"挂起的究竟是什么。
pubDate: 2026-11-04
category: Kotlin
tags: ['Kotlin', '协程', '入门', 'suspend']
draft: false
featured: false
series: Kotlin 协程大白话
---

> **系列导航**：这是「Kotlin 协程大白话」系列的第 1 篇，共 14 篇主线 + 2 篇番外。
> 按顺序读不会卡壳；跳着读也行，就是要多回头翻几篇。

先看一段代码。这是我昨天刚从老项目里翻出来的，一行没改：

```kotlin title="UserRepository.kt"
// 假设有这些类型：data class User(val id: String, val name: String)
//                 data class Order(val id: String, val amount: Int)
//                 data class Profile(val id: String, val avatar: String)
// 以及一个 api 对象，方法签名形如 api.getUser(id, callback)

fun loadUserPage(userId: String) {
    api.getUser(userId, object : Callback<User> {
        override fun onSuccess(user: User) {
            api.getOrders(user.id, object : Callback<List<Order>> {
                override fun onSuccess(orders: List<Order>) {
                    api.getProfile(user.id, object : Callback<Profile> {
                        override fun onSuccess(profile: Profile) {
                            render(UserPage(user, orders, profile))
                        }
                        override fun onFailure(e: Throwable) {
                            showError("档案加载失败")
                        }
                    })
                }
                override fun onFailure(e: Throwable) {
                    showError("订单加载失败")
                }
            })
        }
        override fun onFailure(e: Throwable) {
            showError("用户加载失败")
        }
    })
}
```

三个请求，一个套一个，最深处缩进了八层。

现在我问你一个问题：**这三个请求实际上是"先查用户，再查订单，再查档案"的依赖关系，能不能写成从前往后一句一句往下走的形式？**

答案是不能。至少用回调写不了。

这就是协程要解决的问题。

## 协程解决的那个问题，一句话说完

> **用同步的写法，做异步的事。**

这八个字是整个 Kotlin 协程的提纲。

我们程序员对"异步"有一种条件反射：异步 = 回调 = 括号套括号 = 缩进地狱。这是 Java 8 之前写异步的唯一方式留下的肌肉记忆。

但异步的本质，其实只是"**结果不阻塞当前流程**"。至于结果怎么拿回来，Java 时代给出了两种答案：

**答案一：回调。** 结果到了就调你的函数。

**答案二：阻塞等待。** 结果没到就不让你走。

第一种写着难受，第二种写着简单但会卡住线程。

协程给出了第三种答案：**结果没到，就先"挂起"把这个函数停在那儿，等结果到了自动接着往下走。**

所以改造上面那段代码，理想状态应该长这样：

```kotlin title="UserRepository.kt"
suspend fun loadUserPage(userId: String) {
    val user = api.getUser(userId)
    val orders = api.getOrders(user.id)
    val profile = api.getProfile(user.id)
    render(UserPage(user, orders, profile))
}
```

从八层缩进，变成四行直线。**读起来就像同步代码，执行的却是异步逻辑。**

这句话反过来也成立：**协程没有发明异步，它只是换了一种组织异步的方式。**

## 协程不是线程

这是必须第一个澄清的误解，因为几乎所有人第一次接触都会搞混。

> **线程是操作系统的资源。协程是编程语言在语言层面造出来的抽象。**

打个比方：

**线程**像一条条车道。Android 系统给你划了几十条车道，每个车道同一时刻只能跑一辆车。线程是"车道"本身——一条车道从它被创建出来到被销毁，一直就占着那块资源。

**协程**像跑在车道上的**车**。车还是那些车（线程数量没变），但同一辆车可以中途**驶进路边的停车带**暂歇一会儿，把车道让给后面的车，等准备好了再回到车道上继续开。

关键点在于：**车道数量并没有变多，但车流的利用率高了很多。**

这个差别在数字上非常夸张：

| | 线程 | 协程 |
|---|---|---|
| 谁创建的 | 操作系统 | 编程语言运行时 |
| 切换成本 | 上下文切换，要进内核 | 改几个变量指向，几乎零成本 |
| 内存占用 | 1MB 栈起步 | 几十字节起 |
| 数量上限 | 几千个就到顶 | 几十万个轻松 |
| 典型场景 | 真正的并行计算 | 大量的等待型任务（网络、IO） |

所以你听到的那些说法——"协程是轻量级线程"——严格来讲是**错的**。协程不是线程的替代品，协程是**跑在线程上的**。它替代的是"用线程来表达等待"这件事。

**Android 上为什么协程火？** 因为 Android 99% 的任务都属于"等待型"：等网络、等数据库、等文件读写。这些任务真正消耗 CPU 的时间不到 5%，剩下 95% 的时间线程全在干等。用线程表达，就是让一辆车占着车道干等。

## "挂起"到底挂起了什么

这是整个协程最关键的一个词，也是误解最多的一个。

> **挂起时，被挂起的是"这个函数"，不是"线程"。线程被释放回池子里，去干别的活了。**

再看一遍上面那个类比：演员演到一半要换衣服，他不会傻站在舞台上挡着别人，而是把台词记一下、下台去后台。换别的演员上台继续演，等他换好衣服回来，接着刚才那句台词往下演。

- **演员** = 你的协程
- **舞台** = 线程
- **台词** = 程序执行位置（Kotlin 里叫 `Continuation`）
- **后台准备** = 等待网络响应

线程还是那个线程，只是换人用了。这一点非常关键，因为**线程数量没变**，所以协程不会带来"线程泄漏"或者"线程不够用"的问题。

### 挂起 ≠ 阻塞

这两个词经常被混用，但它们是对立的：

**阻塞**（`Thread.sleep(1000)`）：

- 线程被钉死在这行代码上，1 秒内什么都干不了
- 线程池里的线程被白白占住
- 100 个并发就是 100 个线程被睡在那里

**挂起**（`delay(1000)`）：

- 这个函数停在第 3 行等着
- 线程被释放，去执行别的任务
- 1 秒后有人"喊"它一声，它回到第 4 行继续
- 100 个并发可能只用 1 个线程

> **这才是协程能扛住高并发的真正原因。不是它更轻，而是它不浪费线程去干等。**

## 一个必须当场纠正的误解

网上和 code review 里经常能看到这种说法：

```kotlin title="UserRepository.kt"
// ❌ 错误理解：以为 suspend 会把线程卡住
suspend fun fetchUser(): User {
    // 这里的网络请求"会阻塞住线程"
}
```

**不是的。**

`suspend` 修饰的函数，如果内部发生等待（网络、IO），等待的是**这个协程**，不是线程。线程在这段时间里被完全释放，可以去跑别的协程。

那有人要问了：`suspend` 函数既然不会阻塞线程，为什么还要专门写这个 `suspend` 关键字？

因为编译器需要知道**"这个函数可能中途让出执行权"**。有了这个标记，编译器才能：

1. 把函数改写成一个状态机，记住"我停在第几行了"
2. 允许在 `suspend` 函数里调用其他 `suspend` 函数
3. 让调用方知道："我调的这个函数可能会让出，所以调用它的地方也得是协程"

具体的编译原理（状态机怎么生成的、什么叫 CPS 变换）比较绕，**下一篇专门讲**，这一篇先记住结论：

> **`suspend` = "我可能会中途让出执行权"**，仅此而已。

## 那"协程"这个词到底指什么？

用了这么多词，得给个准确的说法。

在 Kotlin 里，"协程"其实指的是**一个被编译过的、可以被挂起和恢复的函数调用**。它由两部分组成：

```text
┌─────────────────────────────────────────┐
│  协程 = 可挂起的函数 + 一个执行上下文      │
└─────────────────────────────────────────┘
```

- **可挂起的函数**：就是标了 `suspend` 的那个函数体
- **执行上下文**：记录了"执行到哪了""用哪个线程""谁在管我"

这个"谁在管我"就是下一阶段的主角——`Scope`、`Job`、`Dispatcher` 三件套。

现在只需要知道：**协程本身很轻，它不是对象，是函数调用被编译后的产物。** 另外有个直接的体感：编译器规定 `suspend` 函数只能在协程体里调用，普通函数里调它会直接编译报错——因为没人给它准备执行上下文。

## 改造前后对照

最后把开头那段代码完整改一遍，体会一下差别。

**改之前（回调）：**

```kotlin title="UserRepository.kt"
fun loadUserPage(userId: String) {
    api.getUser(userId, object : Callback<User> {
        override fun onSuccess(user: User) {
            api.getOrders(user.id, object : Callback<List<Order>> {
                override fun onSuccess(orders: List<Order>) {
                    api.getProfile(user.id, object : Callback<Profile> {
                        override fun onSuccess(profile: Profile) {
                            render(UserPage(user, orders, profile))
                        }
                        override fun onFailure(e: Throwable) {
                            showError("档案加载失败")
                        }
                    })
                }
                override fun onFailure(e: Throwable) {
                    showError("订单加载失败")
                }
            })
        }
        override fun onFailure(e: Throwable) {
            showError("用户加载失败")
        }
    })
}
```

**改之后（协程）：**

```kotlin title="UserRepository.kt"
suspend fun loadUserPage(userId: String) {
    try {
        val user = api.getUser(userId)
        val orders = api.getOrders(user.id)
        val profile = api.getProfile(user.id)
        render(UserPage(user, orders, profile))
    } catch (e: Exception) {
        showError("加载失败")
    }
}
```

改动带来的收益，一眼就能看出来：

| | 回调版 | 协程版 |
|---|---|---|
| 缩进层级 | 8 层 | 2 层 |
| 错误处理 | 分散在每个 `onFailure` 里 | 一个 `try-catch` 全包 |
| 加一个新请求 | 多一层缩进 + 多一个错误分支 | 多一行 |
| 中途放弃 | 没有办法，砍不掉已发的请求 | 后面会讲"取消" |

**最爽的是第三行。** 加第四个请求的时候，回调版要多套一层、多写一个 `onFailure`；协程版就是多一行 `val xxx = api.getXxx(...)`。

> 这才是协程真正的价值所在：**它把"异步"这件事从代码结构里彻底抹掉了，只留在一个 `suspend` 关键字上。**

## 本篇要点

三句话带走：

1. **协程不是线程**，是语言层面的抽象，跑在线程上，但比线程轻得多
2. **协程 = 用同步的写法，做异步的事**，靠的是"挂起"这个能力
3. **挂起的是函数，不是线程**——线程被释放去干别的了，所以挂起 ≠ 阻塞

以及一个必须记住的类比：

> 协程像舞台上的演员。挂起是**下台去后台准备**，不是**站在台上发呆**。

## 下一篇

下一篇我们钻进 `suspend` 里面看看：**编译器到底把这个函数改造成了什么样子？**

会搞清楚这个"状态机"是怎么生成的、`delay(1000)` 和 `Thread.sleep(1000)` 在底层到底差在哪、以及为什么说 `suspend` 函数必须在协程里调用。

→ **第 02 篇 · suspend 挂起的到底是什么**

---

*本系列共 14 篇主线 + 2 篇番外，按顺序读最省力。如果你觉得这篇讲清楚了，回博客点个赞就是最大的支持——我会更有动力把它写完。*
