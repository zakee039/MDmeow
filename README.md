![MDmeow](docs/logo.png)

**简体中文** · [English](README.en.md) · [日本語](README.ja.md) · [Deutsch](README.de.md)

# MDmeow

MDmeow 是一款轻量、快速的 WYSIWYG Markdown 编辑器，基于 **Tauri + Milkdown/Crepe** 构建。它尽量保持 Markdown 文件本身的纯净与可迁移性，同时提供接近 Typora 的即时排版体验。

当前版本采用 **Miku Cream** 渲染体系：亮色文档背景、`#39C5BB` 初音青强调色、浅色代码高亮、KaTeX 数学公式、紧凑表格与克制的桌面端界面。

## 主要特性

- **所见即所得 Markdown**：标题、列表、引用、任务列表、表格、链接、图片、脚注等常见语法可直接编辑。
- **源码视图**：一键切换原始 Markdown，带独立行号栏；默认快捷键 `Ctrl/Cmd+/`。
- **多标签页与会话恢复**：自动恢复上次打开的文档。
- **保存 / 另存为**：工具栏分别提供保存与另存为；另存为默认快捷键 `Ctrl/Cmd+Shift+S`。
- **标题栏直接重命名**：点击当前文件名即可原地修改文件名。
- **HTML / PDF 导出**：HTML 为自包含页面；PDF 通过系统打印流程输出。
- **图片兼容**：支持标准 Markdown 图片和常见原始 HTML `<img>` 写法，局部相对路径以当前 Markdown 文件为基准解析。
- **KaTeX 数学公式**：支持行内 `$…$` 与块级 `$$…$$`。
- **可配置快捷键**：设置页中可直接录入新的组合键。
- **Windows“打开方式”集成**：统一使用 `MDmeow.Markdown`，安装版优先，便携版在没有有效安装版时兜底注册。
- **四种界面语言**：简体中文、English、日本語、Deutsch；可跟随系统语言。

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

`MDmeow-<版本>.exe` 是单文件便携版，配置和数据保存在程序所在目录；`MDmeow_<版本>_x64.msi` 是标准 MSI 安装版，内置简体中文、English、日本語、Deutsch 四种安装语言。

安装版使用：

- `%APPDATA%\MDmeow` 保存配置；
- `%LOCALAPPDATA%\MDmeow` 保存本地运行数据；
- `HKLM\Software\MDmeow` 记录安装状态；
- `MDmeow.Markdown` 作为统一 Markdown ProgID。

### Linux

推荐优先使用 AppImage；Debian/Ubuntu 可使用 `.deb`，Fedora/RHEL 系可使用 `.rpm`。Linux 正式包会把设置保存在 `~/.config/MDmeow`，运行数据保存在 `~/.local/share/MDmeow`，并由桌面包注册 `.md/.markdown/.mdx` 文件关联。

AppImage 首次运行前可能需要：

```bash
chmod +x MDmeow-*.AppImage
```

### macOS

提供 Intel + Apple Silicon 通用 `.dmg`。设置与本地数据存放在 `~/Library/Application Support/MDmeow`。当前社区构建未做 Apple Developer ID 签名/公证，如 Gatekeeper 阻止首次启动，可在 Finder 中右键应用并选择“打开”。

> Windows 可能对未签名的社区构建显示 SmartScreen 提示；macOS 未签名构建也可能触发 Gatekeeper。

## 语言

应用内支持：

- 简体中文（`zh-CN`）
- English（`en`）
- 日本語（`ja`）
- Deutsch（`de`）
- 跟随系统（`system`）

`system` 只会映射到上述四种语言；其它系统语言回退到 English。

## Markdown 与图片

MDmeow 优先保持标准 Markdown：

```md
![diagram](./assets/diagram.png)

<img src="./assets/diagram.png" alt="diagram" style="zoom:50%;" data-align="center">

<!--more-->
```

两种图片写法都会在编辑器中渲染；`<!--more-->` 会保留在 Markdown 文件中，但不会在 WYSIWYG 视图里显示。

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

`settings.toml` 支持热加载。常见配置：

```toml
language = "system"         # system | zh-CN | en | ja | de
spellcheck = true
quit_on_escape = false
list_marker = "*"
show_path = false
open_last_session = true
always_show_tabbar = false
editor_font = ""
editor_font_size = 16
source_font = ""
source_font_size = 15
accent = "#39C5BB"
```

`Mod` 在 Windows/Linux 上表示 Ctrl，在 macOS 上表示 Cmd。

## 构建

### 环境要求

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

各平台最终发布构建：

```powershell
# Windows
pnpm release:windows
```

```bash
# Linux
pnpm release:linux

# macOS（universal）
pnpm release:macos
```

每个命令都会把当前平台的正式产物收敛到项目根目录的 `release/`。推送版本 tag 后，GitHub Actions 会自动构建 Linux x64/ARM64 和 macOS universal，汇总产物并生成 `SHA256SUMS.txt`；Windows EXE/MSI 由维护者本地构建后手动上传。

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

## 致谢与许可

MDmeow 基于 **Ali Naderi / Mowl** 二次开发，继续以 **MIT License** 发布。

本分支由 **zakee039** 维护，主要扩展了多语言、可配置快捷键、Windows 文件关联、便携/安装版区分、发布体系、Markdown 兼容修复与 Miku Cream 渲染。
