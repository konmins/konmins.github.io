---
title: 无线调试与 logcat 过滤：几个每天都会用到的 adb 技巧
description: 从 adb pair 无线调试到按 PID、tag、正则过滤 logcat，整理一份日常排查问题真正用得上的命令清单。
pubDate: 2025-11-08
category: 工具
tags: ['adb', '调试', 'Android', '效率']
---

adb 的命令很多，但日常真正高频的就那么十来个。这篇把我在排查问题时最常用的整理一下，尤其是无线调试——有线调试在多设备场景下太难受了。

## 无线调试

Android 11 之后系统自带了无线调试，不需要先插一次 USB。在「开发者选项 → 无线调试」里打开，然后：

```bash title="首次配对"
# 1. 手机端会显示配对码、配对端口和连接端口（两个端口不一样）
adb pair 192.168.1.23:37105
# Enter pairing code: 123456

# 2. 配对成功后用连接端口连上
adb connect 192.168.1.23:40553
```

之后每次只要 `adb connect` 就行。如果经常忘记 IP，存成函数放进 shell 配置：

```bash title="~/.zshrc"
adt() {
  adb connect "$(adb mdns services | awk '/_adb-tls-connect/ {print $3}')" 2>/dev/null || echo "没发现可用设备"
}
```

`adb mdns services` 会自动发现局域网中开启了无线调试的设备，不用手动找 IP。

> 如果连不上，先确认 `adb kill-server && adb start-server`。
> mDNS 在部分路由器上会被拦，这种情况下只能手动 `adb connect`。

## logcat 的正确打开方式

裸跑 `adb logcat` 会被系统日志淹没。几个能让它变得可用的参数：

```bash title="按进程过滤（最有用）"
PID=$(adb shell pidof -s com.example.app)
adb logcat --pid="$PID"
```

比起 `logcat | grep com.example.app`，`--pid` 是内核层面过滤，不会被跨进程日志干扰，也不会漏掉没有包名前缀的日志。

```bash title="只保留崩溃和错误"
adb logcat '*:E' AndroidRuntime:E
```

```bash title="按 tag 过滤 + 正则"
adb logcat -v color -s "OkHttp:*" "MyApp:*" | grep -E "timeout|refused"
```

几个常用的组合参数：

| 参数 | 作用 |
| --- | --- |
| `-v color` | 按级别上色，扫一眼就能找到错误 |
| `-v threadtime` | 带上线程 ID 和时间戳，排查并发问题必需 |
| `-c` | 清空缓冲区，保证看到的是本次操作产生的日志 |
| `-b crash` | 单独读崩溃缓冲区，比抓 `.E` 干净 |
| `-G 16M` | 把缓冲区调大，复现慢 bug 时不容易被冲掉 |

`-c` 这个习惯很值得养成。排查问题前先清一次缓冲，看到的日志就跟操作一一对应：

```bash title="标准排查流程"
adb logcat -c
# ……在手机上操作复现……
adb logcat -b crash -d
```

`-d` 表示 dump 完就退出，不阻塞终端。

## 崩溃堆栈

崩溃日志经常被截断，用 `-b crash` 加上行数控制：

```bash title="抓最近一次崩溃的完整堆栈"
adb logcat -b crash -d -v threadtime | tail -80
```

如果是 native 崩溃（`SIGSEGV`），java 侧看不到东西，要看 tombstone：

```bash
adb shell ls /data/tombstones/
adb bugreport crash.zip
```

`bugreport` 很重但最全，实在定位不到时是最后的手段。

## 几个省时间的小命令

```bash title="常用组合"
# 重装并启动，一条命令搞定
adb install -r app-debug.apk && adb shell am start -n com.example.app/.MainActivity

# 清掉应用数据（比卸载重装快得多）
adb shell pm clear com.example.app

# 看当前前台 Activity
adb shell dumpsys activity activities | grep -i "mResumedActivity"

# 手动触发一次 GC，配合内存分析用
adb shell am send-trim-memory com.example.app COMPLETE

# 录屏（不用再打开录屏 App）
adb shell screenrecord --size 720x1280 --bit-rate 4M /sdcard/demo.mp4
adb pull /sdcard/demo.mp4
```

## 把这些包起来

单条命令都不长，但每天敲几十次就很烦。我把最常用的十几个包成了前面提到的 `adb-toolkit`，比如：

```bash title="等价的一条命令"
adt crash -p com.example.app        # 替代 logcat -c + 复现 + logcat -b crash
adt install app-debug.apk           # 替代 install -r + am start
```

**判断一个工具值不值得写，标准就是「这条命令我一周敲了几次」。** 超过二十次，就值得花半小时把它自动化掉。

如果你也有类似的重复操作，欢迎到 GitHub 上提 issue 聊聊。
