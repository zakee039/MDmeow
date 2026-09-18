![MDmeow](docs/logo.png)

[English](README.md) · **简体中文** · [Deutsch](README.de.md) · [فارسی](README.fa.md) · [العربية](README.ar.md) · [עברית](README.he.md)

# MDmeow

一个小巧、快速的所见即所得 Markdown 编辑器，基于 Tauri 与 Milkdown。磁盘上始终保存普通 Markdown，同时提供接近 Typora 的行内编辑体验。

当前版本将 **Miku Cream** 作为内置默认渲染体系：奶油色文档背景、`#39C5BB` 主强调色、亮色代码高亮、KaTeX 公式、紧凑表格以及克制的界面风格。

## 主要特性

- **所见即所得 Markdown**：标题、列表、引用、任务列表、表格、链接、图片、脚注等直接渲染编辑。
- **Miku Cream 默认渲染**：正文、代码、公式、表格与导出保持统一的亮色视觉体系。
- **亮色代码块**：优先使用 Consolas，18 px 行节奏，相邻代码行使用轻微不同的纯色底纹，语法色包含青绿、蓝、粉、深红、紫等。
- **KaTeX 数学公式**：支持行内 `$…$` 与块级 `$$…$$`。
- **源码视图**：左侧独立灰色行号栏，默认快捷键为 `Ctrl/Cmd+/`。
- **图片兼容**：既支持标准 `![alt](path)`，也支持常见的 HTML `<img ...>`；相对本地路径按当前 Markdown 文件目录解析。
- **博客分隔标记**：`<!--more-->` 会保留在 Markdown 中，但不会显示在所见即所得视图里。
- **快捷键自定义**：设置页点击快捷键框后直接按下新的组合键即可绑定。
- **简体中文 / English / Deutsch**：可跟随系统或手动选择语言。
- **多标签与会话恢复**：可恢复上一次打开的文档。
- **便携设置**：`settings.toml` 默认位于程序旁边，并支持外部修改后自动重载。
- **HTML / PDF 导出**：HTML 自包含 KaTeX 和代码高亮，PDF 使用系统打印对话框。

## Markdown 兼容

MDmeow 优先保持 Markdown 的可移植性，同时对笔记软件和博客中常见的少量原生 HTML 做兼容处理。

```md
![diagram](./assets/diagram.png)

<img src="./assets/diagram.png" alt="diagram" style="zoom:50%;" data-align="center">

<!--more-->
```

两种图片写法都可以在编辑器中显示。HTML 图片仍按原始 HTML 保存，只在所见即所得视图中使用经过限制的显示属性；`<!--more-->` 保留但隐藏。

## Miku Cream 代码渲染

代码块不再使用黑色主题，而是采用亮色方案。默认代码字体栈以 `Consolas` 开头，并回退到 `Courier New` / `Courier`。代码行高采用 18 px，奇偶相邻行使用两个非常接近但清晰的纯色背景，避免毛玻璃、半透明和发灰的感觉。

语法颜色以 Miku 青绿为中心，并明确区分关键词、函数、字符串、数字、类型、运算符和注释。HTML/PDF 导出也采用同一套视觉方向。

## 源码视图

按 **`Ctrl/Cmd+/`** 或顶部源码按钮，可以在所见即所得与原始 Markdown 之间切换。源码视图左侧有独立的灰色行号 gutter，不占用正文内容。`Tab` / `Shift+Tab` 可以缩进或反缩进选中的行。

## 图片

标准 Markdown 图片支持远程 URL、绝对本地路径，以及相对于当前 Markdown 文件的本地路径。HTML `<img>` 同样复用这套路由，并兼容常见的 `width`、`height`、`data-align` 和数值型 `zoom` 样式。

## 默认快捷键

应用级快捷键都可以在 **设置 → 快捷键** 中重新绑定。

| 操作 | 默认快捷键 |
| --- | --- |
| 新建标签页 | `Ctrl/Cmd+N` |
| 打开 | `Ctrl/Cmd+O` |
| 保存 | `Ctrl/Cmd+S` |
| 另存为 | `Ctrl/Cmd+Shift+S` |
| 关闭标签页 | `Ctrl/Cmd+W` |
| 导出 HTML / PDF | `Ctrl/Cmd+E` |
| 切换源码视图 | `Ctrl/Cmd+/` |
| 查找 | `Ctrl/Cmd+F` |
| 替换 | `Ctrl/Cmd+H` |
| 从剪贴板创建链接 | `Ctrl/Cmd+K` |
| Emoji 选择器 | `Ctrl/Cmd+.` |
| 设置 | `Ctrl/Cmd+,` |
| 文本 / H1–H3 / 列表 / 引用 / 代码块 | `Ctrl/Cmd+0`–`7` |

## 设置

设置页面使用快速淡入动画，修改后即时保存。可配置语言、拼写检查、列表符号、会话行为、编辑器/源码字体与字号、强调色和应用快捷键。

`settings.toml` 支持外部编辑后自动重载。如果程序所在目录不可写，MDmeow 会回退到系统配置目录。Release 构建同时生成带注释的 `settings.example.toml`。

## Windows 构建

标准 Tauri Release 构建会生成：

- 便携 `mdmeow.exe`
- NSIS 安装程序
- MSI 安装包

便携 EXE 无需安装。由于社区构建没有代码签名，Windows 可能在首次启动时显示 SmartScreen 提示。

## 本地构建

要求：Node.js 20+、`pnpm`、Rust stable，以及对应平台的 Tauri 构建依赖。Windows 使用 `x86_64-pc-windows-msvc`，并需要 Visual C++ Build Tools、Windows SDK 与 WebView2。

```bash
pnpm install
pnpm build
pnpm tauri dev
pnpm tauri build
```

常用检查：

```bash
pnpm exec tsc --noEmit
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

## 技术栈

| 层 | 技术 |
| --- | --- |
| 桌面外壳 | Tauri v2 / Rust |
| 所见即所得编辑器 | Milkdown Crepe / ProseMirror |
| 代码编辑 | CodeMirror |
| 数学公式 | KaTeX |
| Markdown → HTML | comrak |
| 导出代码高亮 | highlight.js |

代码结构和扩展点见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 致谢与许可

MDmeow 基于 **Ali Naderi** 创建的 **Mowl** 分支开发，继续采用 **MIT License**。当前 fork 由 **zakee039** 维护，在保留原作者版权与许可声明的基础上增加了本地化、快捷键自定义、Markdown 兼容修复、Windows 集成和 Miku Cream 渲染体系。
