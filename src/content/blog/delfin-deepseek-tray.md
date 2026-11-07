---
title: Delfin：给 DeepSeek Harness 做的 Windows 托盘控制器
description: DeepSeek Harness 自带 Web 控制台，但得一直挂着一个终端窗口。我给它写了个 Windows 托盘控制器：状态一眼可见、启停一键、带版本管理与多通道更新。顺便记下 npx 锁版本、registry 错位、无窗口 exe 调试这几个坑。
pubDate: 2026-11-07
category: 工具
tags: ['开源', 'Python', 'Windows', 'DeepSeek', 'pystray', '托盘']
---

用 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（命令 `dsh`）的时候，有个一直不太舒服的地方：**它得挂着一个终端窗口**。

窗口开着的时候还行，一旦你不小心把它关了，服务跟着一起没；开着的时候吧，那个黑窗口又一直占着任务栏，出问题了也只能对着滚动的日志发呆。

我就想，能不能把它收进系统托盘——**右下角一个绿点表示活着，红点表示死了**，右键就能启停重启。

后来这东西就叫 **Delfin**（德语和西班牙语里的「海豚」），因为 DeepSeek 的标志就是只海豚。

<figure>
  <img src="/delfin/preview.png" alt="Delfin 托盘图标预览，上排是运行中的绿点，下排是已停止的红点" width="760">
  <figcaption>托盘图标：右下角的状态点决定一切。绿点运行中，红点已停止。</figcaption>
</figure>

## 它长什么样

右键托盘图标，菜单长这样：

<figure>
  <img src="/delfin/tray-menu-zh.png" alt="Delfin 托盘菜单截图，服务运行中" width="420">
  <figcaption>菜单会随服务状态实时变化：服务没跑时「停止 / 重启」自动置灰。</figcaption>
</figure>

功能不多，但都是每天都会用到的：

| 特性 | 说明 |
| --- | --- |
| 状态可视化 | 图标右下角绿点/红点，悬停显示版本与 PID |
| 一键控制 | 启动 / 停止 / 重启，停止时连子进程一起收干净 |
| 打开 Web 界面 | 自动从日志里取出**带 token 的地址**再打开浏览器 |
| 版本管理 | 自带本地受管运行时，版本可控、随时切换 |
| 一键更新 | 停服务 → 下载安装 → 自动重启，全程只弹一个气泡 |
| 多通道 | `latest` / `next` / `alpha` 三个通道，偏好记在 `settings.json` |
| 中英双语 | 文案内置两套，**默认跟随系统语言**，也能随时在菜单里切 |
| 单实例 | 命名互斥体保证只有一只海豚，重复双击不会叠出好几只 |

界面文案默认跟着 Windows 的界面语言走。这里有个细节我觉得挺关键：**语言子菜单里的名字固定用母语书写**（`简体中文` / `English`）。哪怕自动判断猜错了，你也能在自己看得懂的那半边找到切换入口。

## 坑一：npx 会把版本锁死

这是整个项目最耗时的一个坑。

早期版本启动服务用的是：

```bat title="dsh-runner.cmd"
npx -y @deepseek-ai/dsh web
```

看起来很标准对吧？问题是 **npx 会把解析出来的版本锁进自己的缓存**。

而 `dsh` 大量发布预发布版本，`0.1.1-rc.2` 这种。npm 对预发布版本的 range 匹配规则非常严格——`^0.1.1-rc.2` 只在 `major.minor.patch` **三个段完全相同**的时候才算满足。

结果就是：缓存里锁了 `^0.1.1-rc.2`，后面哪怕出了 `0.1.1-rc.3`、`0.1.2-rc.1`，条件都不满足，**永远不升级**，而且从外面看一点异常都没有。

所以现在改成托盘自己管一份运行时：

```text title="runtime/"
runtime/
├── package.json                          ← 私有清单，dependencies 里精确锁定 dsh 版本
└── node_modules/@deepseek-ai/dsh/
```

更新的时候不用 range，直接把版本号写死：

```python title="dsh_update.py"
cmd = [npm, "install", "%s@%s" % (PKG_NAME, version), "--prefix", runtime_dir,
       "--save-exact", "--no-audit", "--no-fund", "--loglevel=error"]
```

`--save-exact` 这个参数在这里是刚需。启动时优先用 `runtime\` 里的 `dsh`，**没有才回退到 `npx`**，所以老用户第一次点「更新」的时候不需要任何手动初始化，托盘自己就把 `runtime/` 建好了。

## 坑二：查询和安装必须走同一个 registry

第二个坑更隐蔽，而且它有个名字叫「查得到却装不上」。

早期版本把 npm registry 硬编码成了 `registry.npmjs.org`。我后来在 2026-09-18 拿本机实测了一轮，每源请求 4 次、超时 15 秒：

| registry | 成功率 | 成功时耗时 | 失败时 |
| --- | --- | --- | --- |
| `registry.npmjs.org` | 3/4 | 1.4s | 撞满 15s 超时 |
| `registry.npmmirror.com` | 4/4 | 0.2s | — |

硬编码官方源 + 单次请求 + 零重试，三个问题叠一块，用户点一下「检查更新」就是**最长 15 秒毫无反应**，然后弹一句「检查更新失败」。

但真正致命的还不是慢，而是**查询和安装走的不是同一个源**：

- `npm install` 用的是用户 npm 配置里的 registry
- 版本查询用的是代码里硬编码的官方源

两边不一致的时候，就会出现「查得到却装不上」或者「装得上却查不到」的错位。而且你根本不会意识到是哪里出了问题，因为每个环节单独看都正常。

现在的做法是**跟随 npm 自己的配置**，官方源只作回退：

```python title="dsh_update.py"
def configured_registry():
    """npm 当前生效的 registry（进程内缓存）。环境变量 DSH_NPM_REGISTRY 可强制覆盖。"""
    if not _registry["done"]:
        val = (os.environ.get("DSH_NPM_REGISTRY")
               or _npmrc_registry()      # 先直接读 .npmrc，不启子进程，最快路径
               or _ask_npm_registry())   # 读不到再问 npm 自己（较慢，仅兜底）
        _registry["value"] = val.rstrip("/") if val else None
        _registry["done"] = True
    return _registry["value"]
```

读取顺序是：环境变量 → `~/.npmrc` → 问 `npm config get registry` → 官方源兜底。`~/.npmrc` 那条路径直接解析文本文件，不启子进程，是最快的一档。

另外，失败的时候要把**每个源各自的错误合并抛出**：

```python title="dsh_update.py"
errors.append("%s → %s" % (reg, last))
raise RuntimeError("；".join(errors) or "没有可用的 registry")
```

不然用户只会看到一句 `urlopen error`，既不知道卡在哪，也不知道下一步该做什么。

## 坑三：无窗口的 exe 出错，等于人间蒸发

打包成 `--noconsole` 之后有个很恶劣的性质：**`sys.stdout` 直接是 `None`**。

意味着任何 `print()` 什么都不会发生，任何没捕获的异常都会**静默消失**。用户看到的现象是「双击了，什么都没发生，托盘图标也没有」——完全无从查起。

所以托盘里做了两件事：接管全局异常钩子，以及把 pystray 内部只写 logger 的异常也捞出来落盘。

```python title="dsh-tray.py"
def install_excepthooks():
    sys.excepthook = lambda t, e, tb: log_exc(t, e, tb, "main")
    threading.excepthook = lambda a: log_exc(a.exc_type, a.exc_value, a.exc_traceback,
                                             "thread:%s" % a.thread.name)
```

```python title="dsh-tray.py"
root = logging.getLogger()
root.setLevel(logging.INFO)          # DEBUG 会把 PIL 各插件导入刷满日志
logging.getLogger("PIL").setLevel(logging.WARNING)
for h in list(root.handlers):
    root.removeHandler(h)
root.addHandler(_F())                # 自定义 Handler 直接写 logs/tray.log
```

注意那个 `PIL` 的日志级别——不压下来的话，一次启动能往日志里刷几百行 PIL 插件的导入信息，真正有用的异常反而淹在里面。

最后所有异常都落到 `logs/tray.log`。用户报障的时候只要一句「你看下 `logs/tray.log`」，就能拿到 traceback。

## 坑四：token 藏在日志里

新版 `dsh` 的 Web 控制台不是直接就能访问的，首次访问需要带 `?token=…`，直接开 `http://127.0.0.1:3080` 会 401。

而这个 token 是服务启动时随机生成、打印到日志里的。托盘的做法是从日志里把它捞出来：

```python title="dsh-tray.py"
def web_url():
    """带 token 的访问地址：新版 dsh 首次访问需带 ?token=…（从服务日志最后一条抓取）"""
    with open(LOG_FILE, "r", encoding="utf-8", errors="ignore") as f:
        lines = f.readlines()[-400:]          # 只看最后 400 行，日志再长也不会撑爆内存
    for line in reversed(lines):              # 倒序找，最后一条就是最新的
        m = re.search(r"http://127\.0\.0\.1:%d/\?token=[A-Za-z0-9_\-]+" % PORT, line)
        if m:
            return m.group(0)
    return URL                                # 兜底：至少给出不带 token 的地址
```

这里有个失败模式值得注意：**如果用户清空过日志，token 就抓不到了**。所以「打不开 Web 界面」这个问题，标准解法是「先重启一次服务」，让新地址重新落盘。

## 坑五：单实例互斥体的正确判法

托盘程序最经典的翻车方式就是用户双击了两下，任务栏多出两只海豚，两份服务互相抢端口。

Windows 上用命名互斥体解决。但这里有个非常容易写错的点：

> **`CreateMutexW` 在互斥体已存在时，仍然会返回一个有效的句柄。**

也就是说，光看返回值是判断不出「有没有别的实例在跑」的。必须靠 `GetLastError()`：

```python title="dsh-tray.py"
def acquire_single_instance():
    """获取单实例互斥锁；已有实例在运行时返回 None

    注意：CreateMutexW 在互斥体已存在时仍返回有效句柄，必须靠
    GetLastError()==ERROR_ALREADY_EXISTS(183) 判断，且句柄要按指针宽度读取。
    """
    k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    k32.CreateMutexW.restype = ctypes.c_void_p
    handle = k32.CreateMutexW(None, False, "dsh-tray-single-instance")
    if not handle or ctypes.get_last_error() == 183:
        return None
    return handle
```

`restype = ctypes.c_void_p` 这行也不能省。ctypes 默认按 `c_int` 返回，64 位系统上指针会被截断，句柄拿到手就是错的。

## 图标是代码生成的

托盘图标需要两套（绿点/红点）、还要能缩放到 16px 依然清晰。所以它不是画出来的，是**生成**出来的：

```python title="make_icon.py"
def build(mask_src, whale_color, dot_color, size=ICON_SIZE, gap=True):
    """组合：小海豚剪影 + 右下角状态点"""
    m = mask_src.resize((size, size), Image.LANCZOS)
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    img.paste(Image.new("RGBA", (size, size), whale_color), (0, 0), m)
    d = ImageDraw.Draw(img)
    r = size * DOT / 2
    cx = cy = size * (1 - DOT / 2) - size * 0.045
    if gap:  # 在圆点周围留出一圈空隙，任何底色下都清晰
        d.ellipse([cx - r * 1.15, cy - r * 1.15, cx + r * 1.15, cy + r * 1.15], fill=(0, 0, 0, 0))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=dot_color)
    return img
```

`gap` 那一步是关键：在状态点周围抠出一圈透明空隙，这样无论任务栏是浅色还是深色，圆点都能跳出来，不会糊成一团。

生成完之后，PNG 会被转成 base64 **直接写进 `dsh_icons.py`**：

```python title="dsh_icons.py（自动生成，勿手改）"
RUNNING = "iVBORw0KGgoAAAANSUhEUg..."
STOPPED = "iVBORw0KGgoAAAANSUhEUg..."
```

为什么要这么绕？因为要打成**单文件 exe**。图标内嵌在源码里，PyInstaller 打包时就不用操心外部资源路径被改坏，图标永远不会丢。

同时还会生成一份多尺寸的 `.ico`（16 / 20 / 24 / 32 / 40 / 48 / 64 / 128 / 256），给 exe 和快捷方式用。

## 自检：不打开图形界面也能验证

有个问题很实际：托盘程序出问题时，你可能根本没法在出问题的机器上复现（毕竟要的就是「不占任务栏」）。

所以加了个 `--selftest`：

```bat title="命令行"
dsh-tray.exe --selftest
```

它不启动托盘，转而把所有纯逻辑的东西都验一遍：

- **文案表完整性**——遍历所有翻译 key，检查中英两侧都有值
- **英文界面不能混入中文**——用 `[\u4e00-\u9fff]` 正则扫英文菜单和悬停提示
- **`t()` 参数格式化**——确认 `%s` 真的被替换掉了
- **图标解码**——确认 base64 能还原成 64×64 的图
- **registry 可达性**——确认能查到 `dist-tags`

那个「英文界面混入中文」的检查挺实用。双语项目最容易出的问题就是新增了一个菜单项只写了中文，英文用户看到一半中文一半英文。语言子菜单里用母语书写的名字是按设计豁免的，校验逻辑里专门把它们排除掉了。

## 顺手做的几件小事

**状态轮询线程绝不能死。** 每 3 秒探一次端口，状态变了才换图标、重建菜单：

```python title="dsh-tray.py"
def poll_loop():
    while True:
        try:
            running = is_running()
            if running != _last_state:
                if _last_state is not None:  # 首次不弹气泡
                    icon.notify(t("notify_started", URL), "DeepSeek Harness")
                _last_state = running
                icon.icon = ICON_GREEN if running else ICON_RED
                icon.title = tray_title(running)
                icon.menu = build_menu()
        except Exception:  # 轮询线程绝不能因单次异常退出
            log_exc(*sys.exc_info(), where="poll")
        time.sleep(3)
```

`except` 之后没有 `break` 也没有 `return`——线程死了托盘就再也不会更新状态了，那还不如没有。

**消息循环意外结束要能重建。** pystray 的 `icon.run()` 有可能因为底层的 `WM_QUIT` 或异常直接返回。所以外面套了层重试：

```python title="dsh-tray.py"
attempts = 0
while not _exit_requested.is_set() and attempts < 5:
    icon = pystray.Icon("dsh-tray", ICON_RED, tray_title(False))
    icon.menu = build_menu()
    try:
        icon.run()
    except Exception:
        log_exc(*sys.exc_info(), where="icon.run")
    if _exit_requested.is_set():
        break
    attempts += 1
    log_msg(t("log_rebuild", attempts))
    time.sleep(2)
```

**写 `.cmd` 文件必须 CRLF + 无 BOM。** 这个坑很隐蔽——cmd.exe 会把 UTF-8 BOM 当成第一条命令的一部分，于是脚本开头多出一堆乱码字符。

```python title="dsh-tray.py"
with open(RUNNER, "w", encoding="ascii", newline="\r\n") as f:
    f.write(RUNNER_TEXT)
```

**双击 exe 时 PATH 可能不完整。** 从资源管理器双击启动的进程拿到的环境变量跟你在终端里敲不一样，npm 经常找不到。所以 `npm_cmd()` 做了一条兜底链：先 `shutil.which`，再从 node 的安装目录推断，再去 `C:\Program Files\nodejs` 之类的常见位置硬找。

**停止服务要连子进程一起收。** `taskkill /PID <pid> /T /F`，`/T` 是关键——不然 dsh 自己起的那些 node 子进程会变成孤儿进程，继续占着 3080 端口。

## 怎么用

到 [Releases](https://github.com/konmins/delfin/releases) 下载 `delfin-v*-win64.zip`，解压到任意目录，然后双击 `dsh-tray.exe`。

> **包里必须有两个文件，不能只拖走 exe：**
> - `dsh-tray.exe` —— 托盘程序本体
> - `dsh-runner.cmd` —— 服务启动器，点托盘里的「启动」时由它拉起 dsh
>
> 少了后者，托盘能打开，但点「启动」会提示找不到运行器。

本机需要装 **Node.js 18+**（`dsh` 依赖它运行）。

### 关于「未知发布者」提示

双击时 Windows 会提示「Windows 已保护你的电脑」，需要手动放行一次。

这是 **SmartScreen 的信誉提示，不是杀毒判定**——exe 尚未做代码签名，Windows 无法确认发布者身份，所以对从网络下载的程序一律先拦一次。放行方式任选其一：

1. 点提示框里的 **「更多信息」→「仍要运行」**
2. 右键 exe →「属性」→ 底部勾选 **「解除锁定」**，命令行等价写法是 `Unblock-File .\dsh-tray.exe`

顺带说一句，早前这个 exe 还会被 Defender 的机器学习启发式判成 `Trojan:Win32/Sabsik.FL.A!ml` 而**直接隔离删除**。那个 `!ml` 后缀表示启发式判定，并非命中真实的病毒特征。这个误报已经向微软提交申诉并解除，现在基本见不到了；如果你的机器特征库偏旧，可能会再遇到，先更新一下病毒库即可。

代码签名走的是 [SignPath Foundation](https://signpath.org) 的免费方案，目前还在接入中，所以当前版本仍未签名。

## 写在最后

这个项目是**第三方非官方工具**，跟 DeepSeek 官方没有任何隶属或背书关系。图标里用的海豚形状是 DeepSeek 的商标，只用于标识「这个托盘控制的是 dsh」，不包含在 MIT 许可的授权范围内。

代码全部开源，欢迎自己读、自己改、自己打包。

**仓库地址**：[github.com/konmins/delfin](https://github.com/konmins/delfin)

许可：MIT © 2026 Konmin
