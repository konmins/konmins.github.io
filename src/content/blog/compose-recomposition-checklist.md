---
title: Compose 重组排查清单：从「为什么它一直在重组」到「怎么改」
description: 一份可以照着做的 Compose 性能排查清单：先确认重组范围，再逐个检查稳定性、lambda 捕获、derivedStateOf、key 和 Modifier 顺序。
pubDate: 2026-07-15
category: Compose
tags: ['Compose', '性能优化', 'UI', 'Android']
featured: true
---

Compose 的性能问题有个麻烦之处：**它几乎从不报错。** 界面能显示、交互也能用，只是滑动偶尔掉帧、动画偶尔卡一下。等到用户反馈「有点卡」的时候，往往已经积累了好几个问题。

这篇是我自己排查时按顺序走的一张清单。

## 第一步：先量，别猜

打开 Layout Inspector，勾上 **Show Recomposition Counts**。任何优化之前先拿到基线，否则改完不知道有没有效果。

要更细的话，用编译器指标。在 `build.gradle.kts` 里加：

```kotlin title="app/build.gradle.kts"
composeCompiler {
    metricsDestination.set(layout.buildDirectory.dir("compose-metrics"))
    reportsDestination.set(layout.buildDirectory.dir("compose-reports"))
}
```

构建后会在报告里列出每个 composable 的 `skippable` / `restartable` 状态。**不能 skip 的函数，是重组的重灾区。**

## 第二步：检查参数是否「稳定」

Compose 靠参数相等性判断能否跳过重组。而「相等」这件事，编译器的判断很严格：

```kotlin title="ProfileCard.kt"
// ❌ List 在编译器眼里是 unstable，参数一变就重组
@Composable
fun ProfileCard(items: List<String>) { /* ... */ }

// ✅ 用不可变集合，编译器知道它可以被跳过
@Composable
fun ProfileCard(items: ImmutableList<String>) { /* ... */ }
```

不确定的话直接标注：

```kotlin title="model/User.kt"
@Immutable
data class User(
    val id: String,
    val name: String,
    val avatarUrl: String,
)
```

几个高频踩坑点：

- `List`、`Map`、`Set` 都是 unstable，`kotlinx.collections.immutable` 里的对应类型才是 stable；
- 来自 `data class` 但字段里有 `var` 或外部类型的，仍然 unstable；
- 跨模块传递的类，如果模块没有开启 Compose 编译，会被当成 unstable。

## 第三步：lambda 有没有「捕获」不该捕获的东西

这是我最常犯的错：

```kotlin title="FeedScreen.kt"
@Composable
fun FeedScreen(items: List<Item>) {
    // ❌ lambda 捕获了 items，每次重组都是新对象，LazyColumn 永远无法跳过
    LazyColumn {
        items(items) { item ->
            ItemRow(item, onClick = { viewModel.select(item.id, items.size) }) // [!code highlight]
        }
    }
}
```

`items.size` 这个捕获让 lambda 每次都是新的。把不需要的值去掉，或者用 `remember` 缓存：

```kotlin title="FeedScreen.kt"
@Composable
fun FeedScreen(items: List<Item>) {
    LazyColumn {
        items(items, key = { it.id }) { item ->
            ItemRow(item, onClick = { viewModel.select(item.id) })
        }
    }
}
```

> 顺带一提：`LazyColumn` 一定要给 `key`。不给的话，列表增删时 Compose 只能按位置复用，
> 会导致状态错位（比如输入框里的文字跑到另一行去了），而且动画也没法正常做。

## 第四步：状态派生有没有用 derivedStateOf

每次滚动都要读的派生值，不用 `derivedStateOf` 会白白触发重组：

```kotlin title="FeedScreen.kt"
@Composable
fun FeedScreen(listState: LazyListState) {
    val showTopButton by remember {
        derivedStateOf { listState.firstVisibleItemIndex > 0 } // [!code ++]
    }

    // ❌ 这样写，滚动过程中每一帧都会重组整个 FeedScreen
    // val showTopButton = listState.firstVisibleItemIndex > 0 // [!code --]
}
```

判断标准很简单：**这个值的读取频率远高于它的变化频率，就该用 `derivedStateOf`。**

## 第五步：状态更新的粒度对了吗

```kotlin title="FormViewModel.kt"
// ❌ 用一个巨大的 UiState，输入框每敲一个字整个页面都重组
private val _state = MutableStateFlow(FormUiState())
val state: StateFlow<FormUiState> = _state.asStateFlow()
```

更细的做法是让每个高频变化的值有自己的来源，并在 UI 层只订阅用到的部分：

```kotlin title="FormScreen.kt"
@Composable
fun FormScreen(viewModel: FormViewModel) {
    // 只订阅名字，其他字段变化不会触发这个 composable 重组
    val name by viewModel.name.collectAsStateWithLifecycle()

    TextField(value = name, onValueChange = viewModel::onNameChange)
}
```

## 第六步：Modifier 顺序和重绘范围

Modifier 是从左到右包裹的，顺序错了会带来额外开销：

```kotlin title="Card.kt"
// ❌ padding 在外，背景也被撑大了，重绘区域变大
Modifier
    .padding(16.dp)
    .background(Color.White)

// ✅ 先画背景再让开空间
Modifier
    .background(Color.White)
    .padding(16.dp)
```

同类问题还有 `Modifier.clip()` 和 `Modifier.background()` 的先后——先 clip 再画，才能保证背景被裁进圆角里。

## 一张速查表

| 症状 | 常见原因 | 处理 |
| --- | --- | --- |
| 滑动掉帧 | 每帧都在重组列表项 | 检查参数 stability、给 `items` 加 `key` |
| 输入卡顿 | 整页订阅了同一个大 State | 拆细状态，按字段订阅 |
| 动画抖动 | 派生状态触发连锁重组 | 用 `derivedStateOf` |
| 列表状态错位 | `items` 没给 `key` | 补上稳定且唯一的 key |
| 局部区域异常重绘 | Modifier 顺序问题 | 调整 `background` / `padding` / `clip` 顺序 |

## 最后

清单里的每一条都很小，但 Compose 的性能问题恰恰就是这么攒出来的。

一个更省事的办法是把这些规则固化成静态检查——我现在用一套自定义的 Detekt 规则，在 CI 阶段就拦住「Composable 里 new 对象」「Modifier 没有默认值」这类问题。这部分下次单独写一篇。
