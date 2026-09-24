**简体中文** · [English](README.en.md) · [日本語](README.ja.md) · [Deutsch](README.de.md)

# MDmeow

> **打开即工作。**
>
> **AI 时代，一款轻快、精美、以审阅为主的 Markdown / 代码文档工具。**

[🌐 在线演示](https://mdmeow.zakee.fun)

AI 时代，越来越多内容不是从空白文档开始写出来的，而是由 Agent、LLM、脚本和自动化工具先生成，再交给人确认。

README、方案、研究笔记、JSON / YAML、配置文件、代码片段、日志……我们真正高频做的事情，正在从“从头写”变成：

**打开 → 阅读 → 审阅 → 小改 → 保存。**

MDmeow 就是为这个工作流设计的。

它不是 IDE，也不想成为沉重的知识库。它希望像记事本一样直接，像排版工具一样舒服，又能在需要时看懂 Markdown、配置和代码。

**文件双击打开，内容马上可读；需要修改时，直接改。**

这就是 MDmeow 的核心：**打开即工作。**

## 审阅优先，编辑随手

MDmeow 的重点不是堆满编辑功能，而是让你更快看懂一个文件。

Markdown 默认以排版后的文档呈现；JSON、YAML、Python、Rust、JavaScript、配置文件和普通文本则直接进入轻量代码视图。颜色、行号、隔行着色与字体共同服务于阅读，而不是把界面变成另一个 IDE。

适合这些场景：

- 快速检查 AI / Agent 生成的 Markdown
- 审阅 README、方案、研究记录和交付文档
- 查看并小改 JSON、YAML、TOML、INI、ENV 等配置
- 阅读脚本、源码、日志和文本文件
- 在格式化文档和源码之间快速确认内容

## 两种模式，足够了

### Markdown 渲染模式

Markdown 打开后默认进入所见即所得的文档视图。

- 标题、列表、引用、任务列表、表格、链接、脚注直接阅读和编辑
- 图片、公式、代码块在正文中直接渲染
- 代码块带语法高亮、行号、复制反馈和轻量隔行着色
- Ctrl/Cmd + / 随时切换到 Markdown 源码
- 保存下来的仍然是普通 Markdown，不使用私有文档格式

### 代码模式

非 Markdown 文本默认进入 Code 模式。

它本质上仍然是一款轻量文本编辑器，只是利用 CodeMirror 的语言解析和 MDmeow 现有的 Miku Cream 配色帮助你更快看懂内容。

支持常见：

- 配置 / 数据：JSON、YAML、XML、TOML、INI、CONF、ENV、JSONL、CSV
- Web：HTML、CSS、SCSS、LESS、JavaScript、TypeScript、JSX、TSX、Vue
- 程序代码：Python、Rust、C/C++、Java、Go、PHP、SQL、Shell、PowerShell、Ruby、Swift、Kotlin、C#
- 文本：TXT、LOG
- 其它可读取的 UTF-8 文本也可以按纯文本打开

Code 模式提供行号、语法颜色、查找替换、保存，以及可关闭、可自定义颜色的隔行着色。

它的定位很明确：**能看、能改，但不试图替代 VS Code。**

## Miku Cream：让审阅更舒服

- 浅色、低干扰的阅读界面
- 默认强调色 #39C5BB
- Markdown 代码块与 Code 模式共享语义配色
- 代码普通行与文档背景一致
- 默认使用 #FAFFFF 做轻量隔行区分，可在设置中自定义
- 正文与源码字体、字号可独立设置
- 行内代码、公式、表格和图片尽量保持清晰层级

视觉目标不是“炫”，而是让长时间阅读更轻松。

## 图片、公式和代码，都留在文档里看

Markdown 审阅时不应该频繁跳到别的工具。

图片支持标题、左 / 中 / 右对齐、25% ～ 200% 缩放和删除。Markdown 图片与 HTML img 使用统一交互。

KaTeX 支持行内公式和块级公式：

~~~text
$E = mc^2$

$$
\int_a^b f(x)\,dx
$$
~~~

代码块支持语法高亮、独立行号、复制反馈和统一的 Miku Cream 代码配色。

## 文件打开，本来就应该自然

- 拖拽文件直接打开
- 多标签页
- 标题栏可显示完整路径
- 可恢复上一轮会话
- 可选择是否记住窗口位置与大小
- 不记住位置时，始终以合适尺寸在主屏居中打开
- Windows 文件关联可在设置中按后缀选择
- 支持 Markdown、配置、Web、代码、文本等多类文件
- “设置为默认”会先完成注册，再交给 Windows 默认应用界面确认

MDmeow 不会绕过 Windows 的默认应用安全机制。

## 导出、代理与更新

Markdown 可以直接导出 HTML，或通过系统打印流程输出 PDF。

远程图片和 GitHub 更新可以使用 HTTP / HTTPS、SOCKS5 / SOCKS5H 代理，并带连接测试。

Windows 提供：

~~~text
MDmeow-<版本>.exe
MDmeow_<版本>_x64.msi
~~~

分别对应单文件便携版和 MSI 安装版。Linux 和 macOS 也保留自动构建流程。

## 轻快，不只是口号

![MDmeow 轻量运行示例](docs/assets/screenshots/lightweight.png)

> 上图是一台 Windows 设备上的空白文档运行示例。实际资源占用会随文档内容、WebView2 与系统环境变化。

MDmeow 基于 **Tauri + Milkdown/Crepe + CodeMirror**。

它不试图同时承担 IDE、知识库和完整写作平台的所有职责。少做一些，才能打开得更快，也更适合作为每天随手点开的审阅工具。

## 常用快捷键

| 操作 | 默认快捷键 |
| --- | --- |
| 新建标签页 | Ctrl/Cmd+N |
| 打开 | Ctrl/Cmd+O |
| 保存 | Ctrl/Cmd+S |
| 另存为 | Ctrl/Cmd+Shift+S |
| 关闭标签页 | Ctrl/Cmd+W |
| 导出 HTML / PDF | Ctrl/Cmd+E |
| Markdown 源码 / 渲染切换 | Ctrl/Cmd+/ |
| 查找 | Ctrl/Cmd+F |
| 替换 | Ctrl/Cmd+H |
| 设置 | Ctrl/Cmd+, |

应用级快捷键可以在 **设置 → 快捷键** 中重新绑定。

## 配置

设置保存在 settings.toml 中，并支持即时保存。

~~~toml
language = "system"
spellcheck = true
open_last_session = true
show_path = false

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
~~~

## 从源码构建

环境：

- Node.js 20+
- pnpm
- Rust stable
- Windows：Visual C++ Build Tools、Windows SDK、WebView2

~~~bash
pnpm install
pnpm build
pnpm tauri dev
~~~

正式构建：

~~~powershell
pnpm release:windows
~~~

~~~bash
pnpm release:linux
pnpm release:macos
~~~

## 技术栈

| 层 | 技术 |
| --- | --- |
| 桌面壳 | Tauri v2 / Rust |
| Markdown 渲染 / 编辑 | Milkdown Crepe / ProseMirror |
| Code 模式 | CodeMirror |
| 数学公式 | KaTeX |
| Markdown → HTML | comrak |
| 导出语法高亮 | highlight.js |
| Windows 安装器 | WiX / MSI |

## 致谢

MDmeow 基于 **Ali Naderi / Mowl** 二次开发，并继续以 **MIT License** 发布。

感谢上游项目提供了一个简洁、优雅的起点。

在此基础上，MDmeow 逐渐形成了自己的方向：不是做更多，而是让 Markdown、代码和 AI 生成文档 **更快打开、更好阅读、更容易确认和轻量修改**。

> **打开即工作。**
