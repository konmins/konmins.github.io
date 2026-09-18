---
title: 用 Kotlin 写一个能真正分发出去的命令行工具
description: 从 Clikt 搭骨架到 GraalVM native-image 打包成单文件二进制，记录用 Kotlin 写 CLI 的完整链路，以及 native-image 上的几个反射坑。
pubDate: 2026-03-12
category: 工具
tags: ['Kotlin', 'CLI', 'GraalVM', '工具链']
series: 把 Kotlin 用到 Android 之外
---

写 Android 久了会形成一种惯性：什么东西都想放进 App 里。但有些需求做成 App 特别别扭——比如「批量把设计给的图切成 Android 的多密度目录」，这明显是个命令行工具更合适。

问题是我最熟的是 Kotlin。为这个去学一门新语言值不值？结论是：**不值，但得先解决分发问题。**

## 骨架：Clikt

命令行解析用 [Clikt](https://ajalt.github.io/clikt/)，它对子命令的支持是我见过最舒服的：

```kotlin title="build.gradle.kts"
dependencies {
    implementation("com.github.ajalt.clikt:clikt:5.0.1")
}
```

```kotlin title="Main.kt"
import com.github.ajalt.clikt.core.CliktCommand
import com.github.ajalt.clikt.core.subcommands

class Adt : CliktCommand(name = "adt") {
    override fun help(context: Context) = "Android 开发常用的一堆小工具"

    override fun run() = Unit
}

fun main(args: Array<String>) {
    Adt().subcommands(
        CrashCommand(),
        InstallCommand(),
        ScreenCommand(),
    ).main(args)
}
```

单个子命令写起来也很直观：

```kotlin title="CrashCommand.kt"
class CrashCommand : CliktCommand(name = "crash") {
    private val packageName by option("-p", "--package").required()
    private val lines by option("-n", "--lines").int().default(60)

    override fun run() {
        val pid = Adb.pidOf(packageName) ?: fail("应用没在运行")

        // 取出最近一次崩溃的堆栈，并把关键帧高亮出来
        val log = Adb.logcat(pid = pid, lines = lines)
        val frames = log.filter { it.contains(packageName) } // [!code highlight]

        echo(frames.joinToString("\n"))
    }
}
```

`fail()` 会以非零状态码退出并打印到 stderr，这样它就能被 shell 脚本的 `&&` 正确串联起来。

## 分发：这才是真正的门槛

JVM 应用分发的标准做法是「打个 fat jar，让用户装 JRE」。对内部工具还行，对外分发基本没人愿意为了一个小工具装 200MB 的运行时。

解决方案是 GraalVM 的 `native-image`：把 JVM 应用编译成原生二进制，启动时间从 300ms 降到 10ms 以内，体积也能压到 20MB 左右。

```kotlin title="build.gradle.kts"
plugins {
    id("org.graalvm.buildtools.native") version "0.10.6"
    id("org.jetbrains.kotlin.jvm") version "2.2.0"
}

graalvmNative {
    binaries {
        named("main") {
            imageName.set("adt")
            mainClass.set("dev.example.adt.MainKt")
            buildArgs.add("--no-fallback")
            buildArgs.add("-H:+UnlockExperimentalVMOptions")
            // 把没用到的 JVM 特性裁掉，体积能小一半
            buildArgs.add("--gc=serial")
            buildArgs.add("-O2")
        }
    }
}
```

一条命令出产物：

```bash
./gradlew nativeCompile
# → build/native/nativeCompile/adt
```

## native-image 上绕不开的坑

**反射是最大的敌人。** native-image 在编译期做静态分析，只保留「能证明会被调用」的代码。反射调用的类在编译期看不出来，就会被裁掉，运行时直接 `ClassNotFoundException`。

我踩的第一个坑来自 `kotlinx.serialization`：

```text title="运行时错误"
Exception in thread "main" kotlinx.serialization.SerializationException:
Serializer for class 'Config' is not found.
```

解决办法是给序列化类加 `@Serializable`（这个必须的，编译期生成 serializer）并把序列化器注册进配置目录：

```kotlin title="src/main/resources/META-INF/native-image/reachability-metadata.json"
{
  "reflection": [
    {
      "type": "dev.example.adt.Config",
      "allDeclaredConstructors": true,
      "allDeclaredFields": true
    }
  ],
  "resources": [
    { "glob": "META-INF/services/*" }
  ]
}
```

第二个坑是 **`Class.getResourceAsStream` 读不到资源**，因为资源不会自动打包进去，同样要在 metadata 里声明。

> 检查办法：加 `-H:+ReportExceptionStackTraces` 和 `--trace-class-initialization`，
> 失败时能看到具体是哪个类被裁掉了。

## 发布到 GitHub Releases

打包这一步交给 GitHub Actions，矩阵构建三个平台：

```yaml title=".github/workflows/release.yml"
jobs:
  build:
    strategy:
      matrix:
        include:
          - os: ubuntu-latest
            artifact: adt-linux-x64
          - os: macos-latest
            artifact: adt-macos-arm64
          - os: windows-latest
            artifact: adt-windows-x64.exe
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: graalvm/setup-graalvm@v1
        with:
          java-version: '21'
          distribution: 'graalvm'
      - run: ./gradlew nativeCompile
      - uses: softprops/action-gh-release@v2
        with:
          files: build/native/nativeCompile/*
```

用户下载一个二进制、`chmod +x` 就能用，不需要装任何东西。

## 值不值

如果只是自己用，写个 shell 脚本或者 Python 可能更快。但只要满足下面任意一条，Kotlin + native-image 就很划算：

- 逻辑超过 500 行，需要类型和单元测试兜底；
- 需要分发给别人，最好是「下载即用」；
- 你已经很熟 Kotlin，不想为一个小工具再学一门语言。

对我来说第三条最关键。**工具的价值在于它真的被用起来，而不是用了什么语言。**

下一篇讲跨平台工具选型的取舍——毕竟 native-image 也不是所有场景的最优解。
