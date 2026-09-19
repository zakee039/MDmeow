**简体中文** · [English](README.en.md) · [日本語](README.ja.md) · [Deutsch](README.de.md)

# MDmeow

> **AI 时代，一款轻快、所见即所得的 Markdown 编辑器。**

AI 时代，我们和 Agent 打交道越来越频繁，而 **Markdown 正在成为人与 AI 之间最常用的文档语言之一**。

需求说明、开发记录、AI 输出、研究笔记、README……越来越多内容最终都会落到一个 `.md` 文件里。

但很多时候，我们需要的并不是一个庞大的写作平台，而只是一个能够 **点开就写、所见即所得、占用克制** 的 Markdown 编辑器。

于是，**MDmeow 诞生了。**

它希望做一件很简单的事：

**像打开记事本一样快地打开 Markdown，像编辑普通文档一样直接修改它。**

轻量、快速、安静，不打扰你的工作流。无论是一份 AI 生成的文档、一篇 README，还是随手记录的 Markdown 文件，双击即可开始阅读和编辑。

## 轻快，不只是口号

![MDmeow 轻量运行示例](docs/readme/lightweight.png)

> 上图是一台 Windows 设备上的空白文档运行示例。实际资源占用会随文档内容、WebView2 与系统环境变化。

MDmeow 基于 **Tauri + Milkdown/Crepe** 构建，目标不是成为一个沉重的知识管理平台，而是做一款真正适合日常 Markdown 工作流的桌面编辑器。

## 为什么是 MDmeow

### 所见即所得，但仍然是 Markdown

你看到的是排版后的文档，保存下来的仍然是可以被其它工具读取的 Markdown。

- 标题、列表、引用、任务列表、表格、链接、脚注等常见语法直接编辑
- 一键切换 **源码视图**
- 尽量保持 Markdown 文件本身干净、可迁移
- 支持标准 Markdown 图片，也兼容常见原始 HTML `<img>`
- `<!--more-->` 等内容可以保留在源码中，而不干扰 WYSIWYG 阅读

MDmeow 不希望把你的文档锁进某种私有格式。

### 图片也应该像普通内容一样好编辑

点击图片即可打开轻量工具栏：

- 设置图片标题
- 左对齐 / 居中 / 右对齐
- 25% ～ 200% 多档缩放
- 删除图片
- 标准 Markdown 图片与 HTML 图片使用统一交互

当图片需要记录缩放或对齐信息时，MDmeow 使用与 Typedown 高度兼容的 HTML 表达，例如：

```html
<img title="diagram" src="./assets/diagram.png" alt="diagram" style="zoom:50%;" data-align="center">
```

相对路径仍然以当前 Markdown 文件为基准解析。

### 代码和公式，不必切换到另一个工具

MDmeow 内置 **Miku Cream** 文档渲染风格：

- 浅色代码块
- 语法高亮
- 独立代码行号
- 复制按钮与成功反馈
- 清晰的行内代码层级
- KaTeX 行内公式与块级公式
- 公式默认以预览为主，需要修改时再进入源码编辑

支持：

```text
$E = mc^2$

$$
\int_a^b f(x)\,dx
$$
```

### 打开文件要快，打开方式也要自然

- 支持直接拖拽 `.md` / `.markdown` / `.mdx` / `.txt`
- Windows 可注册为 Markdown 的“打开方式”
- 安装版优先管理文件关联
- 没有安装版时，便携版可以接管自己的关联
- 标题栏直接点击文件名即可重命名
- 多标签页编辑
- 可恢复上一次会话

### HTML / PDF，写完直接交付

工具栏中的导出按钮提供两种明确的出口：

- **导出 HTML**：生成可独立打开的页面
- **导出 PDF**：调用系统打印流程输出 PDF

不需要为了交付文档再打开另一个编辑器。

### 代理与远程图片

如果你的 Markdown 引用了 GitHub Raw、图床或其它远程资源，可以在设置中配置代理：

- HTTP / HTTPS
- SOCKS5 / SOCKS5H
- 代理地址可以独立测试
- 关闭代理时仍可保留和编辑地址
- 远程图片与版本更新统一复用同一套代理配置

例如：

```text
http://127.0.0.1:7897
socks5://127.0.0.1:7893
```

### GitHub 版本更新

MDmeow 可以直接从 GitHub Release 检查新版本，并使用签名校验更新包。

Windows 下：

- **安装版**：下载新的 MSI 后进入安装更新流程
- **便携版**：把新的 EXE 下载到当前程序目录，与旧版本并存
- 便携版不会偷偷覆盖正在运行的程序
- 可手动检查更新
- 默认最多每 24 小时后台检查一次
- 自动检查失败时不会打扰编辑

更新服务不需要额外服务器，GitHub Release 就是 MDmeow 的更新源。

## 其它体验

- **四种界面语言**：简体中文、English、日本語、Deutsch
- **可配置快捷键**：应用级快捷键可在设置中直接重新绑定
- **字体设置**：正文与源码视图字体可独立配置
- **主题强调色**：默认使用 `#39C5BB` 初音青
- **拼写检查**
- **显示完整路径 / 始终显示标签栏** 等行为选项
- **便携版 / MSI 安装版** 使用各自合适的数据目录与系统集成方式

## 下载

最新版本：

**https://github.com/zakee039/MDmeow/releases/latest**

### Windows

推荐按使用习惯选择：

```text
MDmeow-<版本>.exe
```

单文件便携版。放在哪里就在哪里使用，适合 U 盘、工具目录或不想安装软件的场景。

```text
MDmeow_<版本>_x64.msi
```

标准 MSI 安装版，适合长期使用，并负责 Windows 文件关联。

仓库同时保留 Linux 和 macOS 的构建流程；如果 Release 中没有你需要的平台产物，也可以直接从源码构建。

## 常用快捷键

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
| Emoji | `Ctrl/Cmd+.` |
| 设置 | `Ctrl/Cmd+,` |
| 切换块类型 | `Ctrl/Cmd+0` – `7` |

所有应用级快捷键都可以在 **设置 → 快捷键** 中重新绑定。

## 配置

MDmeow 的设置保存在 `settings.toml` 中，并支持热加载。

常见配置包括：

```toml
language = "system"
spellcheck = true
quit_on_escape = false
open_last_session = true
always_show_tabbar = false
show_path = false

editor_font = ""
editor_font_size = 16
source_font = ""
source_font_size = 15

accent = "#39C5BB"

proxy_enabled = false
proxy_url = ""
auto_check_updates = true
```

`Mod` 在 Windows/Linux 上表示 Ctrl，在 macOS 上表示 Cmd。

## 从源码构建

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

正式构建：

```powershell
# Windows
pnpm release:windows
```

```bash
# Linux
pnpm release:linux

# macOS
pnpm release:macos
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
| 桌面壳 | Tauri v2 / Rust |
| WYSIWYG 编辑器 | Milkdown Crepe / ProseMirror |
| 源码编辑 | CodeMirror |
| 数学公式 | KaTeX |
| Markdown → HTML | comrak |
| 导出语法高亮 | highlight.js |
| Windows 安装器 | WiX / MSI |

## 致谢

MDmeow 基于 **Ali Naderi / Mowl** 二次开发，并继续以 **MIT License** 发布。

感谢上游项目提供了一个优秀、简洁的起点。

在此基础上，MDmeow 重新打磨了面向实际桌面使用的工作流：WYSIWYG 与源码双视图、Miku Cream 文档渲染、图片编辑、代码与公式体验、HTML/PDF 导出、多语言、快捷键、Windows 文件关联、便携/安装版区分、代理以及 GitHub 签名更新等。

MDmeow 仍然想保持最开始的目标：

> **打开 Markdown，然后马上开始工作。**
