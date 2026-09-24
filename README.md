![MDmeow](docs/logo.png)

**简体中文** · [English](README.en.md) · [日本語](README.ja.md) · [Deutsch](README.de.md)

# MDmeow

> **打开即工作。**

MDmeow 是一款轻量、快速、精美的 WYSIWYG Markdown 编辑器，基于 **Tauri + Milkdown/Crepe** 构建。它尽量保持 Markdown 文件本身的纯净与可迁移性，同时提供自然、直接的即时排版体验。

当前采用 **Miku Cream** 渲染体系：亮色文档背景、`#39C5BB` 初音青强调色、浅色代码高亮、KaTeX 数学公式、紧凑表格与克制的桌面端界面。

**打开快、阅读舒服、编辑自然。**

## 主要特性

- **所见即所得 Markdown**：标题、列表、引用、任务列表、表格、链接、图片、脚注等常见语法可直接阅读和编辑。
- **Markdown 源码视图**：一键切换原始 Markdown，带独立行号、语法高亮和轻量隔行着色；默认快捷键 `Ctrl/Cmd+/`。
- **多标签页与会话恢复**：同时打开多个文档，并可恢复上一次会话。
- **保存 / 另存为**：保留传统桌面编辑器的直觉操作，另存为默认快捷键 `Ctrl/Cmd+Shift+S`。
- **标题栏直接重命名**：点击当前文件名即可原地修改文件名。
- **HTML / PDF 导出**：HTML 导出为独立页面，PDF 通过系统打印流程输出。
- **图片兼容**：支持标准 Markdown 图片和常见 HTML `<img>`，相对路径以当前 Markdown 文件为基准解析。
- **KaTeX 数学公式**：支持行内 `$…$` 与块级 `$$…$$`。
- **代码块体验**：语法高亮、独立行号、复制反馈与轻量隔行着色。
- **可配置快捷键**：设置页中可直接录入新的组合键。
- **Windows 文件关联**：可在设置中选择要由 MDmeow 打开的文件后缀。
- **四种界面语言**：简体中文、English、日本語、Deutsch，也可以跟随系统语言。

## 顺手查看其它文本文件

除了 Markdown，MDmeow 也可以直接打开常见配置、代码和文本文件，例如 JSON、YAML、TOML、INI、ENV、HTML、CSS、JavaScript、TypeScript、Python、Rust、日志与 TXT。

这些文件会进入轻量的 **Code 模式**，提供行号、语法颜色、查找 / 替换、保存，以及可关闭、可自定义颜色的隔行着色。

它适合快速查看和轻量修改，不试图替代专业 IDE。

## 下载与运行

正式 Release 覆盖 Windows、Linux 和 macOS：

```text
Windows
MDmeow-<版本>.exe
MDmeow_<版本>_x64.msi

Linux x64
MDmeow-<版本>-linux-x86_64.AppImage
MDmeow-<版本>-linux-x86_64.deb
MDmeow-<版本>-linux-x86_64.rpm

Linux ARM64
MDmeow-<版本>-linux-aarch64.AppImage
MDmeow-<版本>-linux-aarch64.deb
MDmeow-<版本>-linux-aarch64.rpm

macOS
MDmeow-<版本>-macOS-universal.dmg
```

### Windows

`MDmeow-<版本>.exe` 是单文件便携版；`MDmeow_<版本>_x64.msi` 是标准 MSI 安装版，并内置简体中文、English、日本語、Deutsch 四种安装语言。

安装版与便携版维护统一的文件关联逻辑，安装版优先，便携版在没有有效安装版时兜底。

### Linux

推荐优先使用 AppImage；Debian / Ubuntu 可使用 `.deb`，Fedora / RHEL 系可使用 `.rpm`。

### macOS

提供 Intel + Apple Silicon 通用 `.dmg`。当前社区构建未做 Apple Developer ID 签名 / 公证，如 Gatekeeper 阻止首次启动，可在 Finder 中右键应用并选择“打开”。

## Markdown 与图片

MDmeow 优先保持标准 Markdown：

```md
![diagram](./assets/diagram.png)

<img src="./assets/diagram.png" alt="diagram" style="zoom:50%;" data-align="center">

<!--more-->
```

两种图片写法都会在编辑器中渲染；`<!--more-->` 会保留在 Markdown 文件中，但不会干扰 WYSIWYG 阅读。

图片支持标题、左 / 中 / 右对齐、25% ～ 200% 缩放与删除。

## 数学公式

使用 KaTeX 渲染数学公式：

```text
$E = mc^2$

$$
\int_a^b f(x)\,dx
$$
```

## Miku Cream

MDmeow 默认使用 **Miku Cream** 视觉体系：

- 亮色 Cream 文档背景
- `#39C5BB` 主强调色
- Markdown 代码块与 Code 模式共享语义配色
- 代码背景与文档背景保持一致
- 代码隔行默认使用极浅的 `#FAFFFF`，可在设置中修改
- 正文与源码字体、字号可以独立设置

目标不是让界面显得“功能很多”，而是让内容本身更舒服。

## 文件与窗口

- 拖拽文件直接打开
- 多标签页
- 可显示完整文件路径
- 可恢复上一次会话
- 可选择是否记住窗口位置与大小
- 不记住位置时，以合适尺寸在主屏中央启动
- Windows 文件关联可按后缀选择
- 设置修改即时保存

没有必须建立的项目，也没有启动前的复杂配置流程。

## 常用快捷键

| 操作 | 默认快捷键 |
| --- | --- |
| 新建标签页 | `Ctrl/Cmd+N` |
| 打开 | `Ctrl/Cmd+O` |
| 保存 | `Ctrl/Cmd+S` |
| 另存为 | `Ctrl/Cmd+Shift+S` |
| 关闭标签页 | `Ctrl/Cmd+W` |
| 导出 HTML / PDF | `Ctrl/Cmd+E` |
| Markdown 渲染 / 源码 | `Ctrl/Cmd+/` |
| 查找 | `Ctrl/Cmd+F` |
| 替换 | `Ctrl/Cmd+H` |
| Emoji | `Ctrl/Cmd+.` |
| 设置 | `Ctrl/Cmd+,` |

应用级快捷键可以在 **设置 → 快捷键** 中重新绑定。

## 配置

`settings.toml` 支持即时保存。常见配置：

```toml
language = "system"
spellcheck = true
show_path = false
open_last_session = true

editor_font = ""
editor_font_size = 16
source_font = ""
source_font_size = 15

code_alternate_rows = true
code_alternate_row_color = "#FAFFFF"
remember_window_position = false

accent = "#39C5BB"

proxy_enabled = false
proxy_url = ""
auto_check_updates = true
```

## 轻快，不只是口号

![MDmeow 轻量运行示例](docs/assets/screenshots/lightweight.png)

> 实际资源占用会随文档内容、WebView2 和系统环境变化。

MDmeow 基于 **Tauri + Milkdown/Crepe + CodeMirror**。它不会为了覆盖所有场景而不断变成一个更重的软件。

**需要处理 Markdown 的时候，打开 MDmeow 就够了。**

## 构建

环境要求：

- Node.js 20+
- `pnpm`
- Rust stable
- Windows：Visual C++ Build Tools、Windows SDK、WebView2

开发：

```bash
pnpm install
pnpm build
pnpm tauri dev
```

本地 Windows 正式构建：

```powershell
pnpm release:windows
```

Linux / macOS：

```bash
pnpm release:linux
pnpm release:macos
```

推送 `vX.Y.Z` tag 后，GitHub Actions 会自动构建 Windows、Linux x64、Linux ARM64 和 macOS 全平台产物，校验文件集合与 SHA256，并发布同一个 GitHub Release。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 桌面壳 | Tauri v2 / Rust |
| WYSIWYG Markdown | Milkdown Crepe / ProseMirror |
| 源码 / Code 模式 | CodeMirror |
| 数学公式 | KaTeX |
| Markdown → HTML | comrak |
| 导出语法高亮 | highlight.js |
| Windows 安装器 | WiX / MSI |

## 致谢与许可

MDmeow 基于 **Ali Naderi / Mowl** 二次开发，继续以 **MIT License** 发布。

感谢上游项目提供了一个简洁而优雅的 Markdown 编辑器基础。

> **打开即工作。**
