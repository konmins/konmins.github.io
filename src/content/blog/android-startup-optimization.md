---
title: Android 启动优化：从 1.8 秒到 0.9 秒我都做了什么
description: 一次真实的冷启动优化记录：怎么度量启动时间、找出启动路径上的隐形耗时、用 Baseline Profile 让首屏更快，以及哪些优化其实是白费力。
pubDate: 2026-05-28
category: Android
tags: ['Android', '性能优化', '启动优化', 'Baseline Profile']
featured: true
---

我们的 App 冷启动在中端机上大概 1.8 秒。用户没抱怨，但数据上看，启动超过 1.5 秒的那批人，次日留存明显低一截。

于是花了两周做了一轮启动优化，最后落到 0.9 秒左右。这篇记录一下有效的手段和踩过的坑。

## 先定义「启动完成」

优化最怕目标不清。我们取三个指标：

| 指标 | 含义 | 采集方式 |
| --- | --- | --- |
| `timeToInitialDisplay` | 首帧可见 | `Activity.reportFullyDrawn()` 之前的一个系统埋点 |
| `timeToFullDisplay` | 首屏内容真正可用 | `reportFullyDrawn()` |
| 自定义 TTFF | 用户看到有意义内容 | 首屏数据渲染完成的埋点 |

只看 `timeToInitialDisplay` 会自欺欺人——把首帧画成一个白底加 loading，数字会很好看，但用户还是要等。

## 用 Trace 找时间去哪了

不要凭感觉。`Perfetto` 或者 Android Studio 的 System Trace 都能直接看到主线程在干什么。

第一次看 trace 时最意外的发现是：**启动路径上有 300 多毫秒花在了初始化第三方 SDK 上，而它们大多不是首屏需要的。**

```kotlin title="App.kt"
class App : Application() {
    override fun onCreate() {
        super.onCreate()

        // ❌ 全都在主线程串行执行
        CrashReporter.init(this)   // 120ms // [!code --]
        Analytics.init(this)       // 90ms  // [!code --]
        PushService.init(this)     // 110ms // [!code --]

        runBlocking { ConfigRepo.load() } // [!code highlight]
    }
}
```

## 手段一：把初始化从主线程挪走

`ContentProvider` 是很多人忽略的一环。三方 SDK 为了免初始化，常用 `ContentProvider` 自动注册，而这些 provider 会在 `Application.onCreate` **之前**就创建。合并后的 Manifest 里能一眼看到：

```xml title="合并后的 AndroidManifest.xml"
<provider
    android:name="com.thirdparty.InitProvider"
    android:authorities="${applicationId}.thirdparty-init"
    android:exported="false" />
```

能移除的移除，不能移除的（比如 Firebase）就在启动阶段先用空实现占位，真正用到时再延迟初始化。

自己写的初始化改成懒加载 + 按需触发：

```kotlin title="App.kt"
class App : Application() {
    override fun onCreate() {
        super.onCreate()

        // 首屏必须的，放主线程
        ConfigRepo.loadBlocking()

        // 其余丢到后台，用不到的模块永远不会初始化
        lifecycleScope.launch(Dispatchers.Default) {
            CrashReporter.init(this@App)
            Analytics.init(this@App)
        }
    }
}
```

同时加上 **启动任务依赖调度**：`Analytics` 依赖 `ConfigRepo`，那就让 `Analytics` 等待 `ConfigRepo` 完成，而不是一起排队。

## 手段二：Baseline Profile

这是投入产出比最高的一项。ART 在安装时只做一次简单 AOT 编译，热点代码仍然靠 JIT，而 JIT 需要在运行时收集信息、重新编译。Baseline Profile 就是把「启动和首屏会用到的热点方法」提前编译好。

```kotlin title="app/build.gradle.kts"
plugins {
    id("androidx.baselineprofile")
}

baselineProfile {
    saveInSrc = true
}
```

然后用 Macrobenchmark 录制启动路径：

```kotlin title="StartupBenchmark.kt"
@RunWith(AndroidJUnit4::class)
class StartupBenchmark {
    @Test
    fun startup() = benchmarkRule.measureRepeated(
        packageName = "com.example.app",
        metrics = listOf(StartupTimingMetric()),
        iterations = 10,
        startupMode = StartupMode.COLD,
    ) {
        pressHome()
        startActivityAndWait()
    }
}
```

自动生成的 profile 往往不够「像真实用户」。我们的做法是手动补一段声明式的关键路径：

```kotlin title="BaselineProfileGenerator.kt"
@Test
fun generate() = baselineProfileRule.collect(packageName = "com.example.app") {
    pressHome()
    startActivityAndWait()

    // 走一遍真实用户会做的动作，让这些方法也进 profile
    device.findObject(By.res("home_feed")).wait(Until.hasObject(By.res("feed_item")), 3_000)
    device.findObject(By.res("home_feed")).fling(Direction.DOWN)
}
```

效果：中端机冷启动又快了大约 200ms，而且滚动首屏列表的卡顿也明显改善。

> 这一项要记得加进 CI。profile 是跟着代码版本走的，业务代码改了几个版本之后旧的 profile 就基本失效了。

## 手段三：别再「先画个空壳」

之前首屏是这样的：先显示标题栏 + 骨架屏，等接口回来再填内容。骨架屏确实让 `timeToInitialDisplay` 变好看了，但用户感知的启动时间没变。

改成**本地缓存优先**之后，真正有了质变：

```kotlin title="FeedRepository.kt"
suspend fun loadFeed(): Flow<FeedState> = flow {
    // 1. 先吐缓存，通常 10ms 内返回
    cache.get()?.let { emit(FeedState.Content(it, fromCache = true)) }

    // 2. 再拉网络，回来之后静默替换
    runCatching { api.feed() }
        .onSuccess { emit(FeedState.Content(it, fromCache = false)) }
        .onFailure { emit(FeedState.Error(it)) }
}
```

用户看到的是「打开就有内容」，而不是「打开等一会儿才有内容」。这一条对留存的影响比前面所有技术手段加起来都大。

## 走过弯路的地方

- **过度追求 `Application.onCreate` 里一行代码都没有。** 结果初始化时机四处散落，反而更难排查。真正该做的是分清「必须」和「可以等」。
- **把 `SplashScreen` 的退出时机提前。** 数字好看了，但闪一下空白，体验更差。
- **盲目上 `App Startup` 库。** 它解决的是「初始化顺序」问题，如果耗时本身来自 SDK 内部，换调度框架没有用。
- **只在旗舰机上测。** 旗舰机上 300ms 的差异感知不到，中端机上就是能不能忍的区别。测性能一定要用低端机。

## 复盘

优化前我一直以为瓶颈在布局层级。实际做完发现，真正的大头是：

1. 主线程上的第三方 SDK 初始化（约 400ms）
2. 缺少 Baseline Profile，首屏代码全是解释执行（约 300ms）
3. 首屏非要等网络，缓存没用起来（用户感知层面影响最大）

**顺序很重要：先砍掉不该做的事，再让剩下的跑得更快。** 反过来做，就是在优化本来就不该存在的代码。
