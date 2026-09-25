[简体中文](README.md) · **English** · [日本語](README.ja.md) · [Deutsch](README.de.md)

[Homepage](https://zakee.fun) · [Buy me a coffee](https://ifdian.net/a/zakee/plan)

# MDmeow

> **Open it. Get to work.**

MDmeow is a lightweight, fast and polished WYSIWYG Markdown editor built with **Tauri + Milkdown/Crepe**. It keeps Markdown files clean and portable while providing a direct, comfortable editing experience.

The default **Miku Cream** rendering system combines a bright document surface, the `#39C5BB` accent, subtle code colors, KaTeX math, compact tables and a restrained desktop UI.

**Fast to open, comfortable to read, natural to edit.**

## Highlights

- **WYSIWYG Markdown** for headings, lists, quotes, tasks, tables, links, images and footnotes.
- **Markdown source view** with line numbers, syntax colors and subtle alternating rows; `Ctrl/Cmd+/` by default.
- **Multiple tabs and session restore**.
- **Save / Save As** with familiar desktop behavior.
- **Rename from the title area**.
- **HTML / PDF export**.
- **Image support** for standard Markdown and common HTML `<img>` forms.
- **KaTeX math** for inline and block equations.
- **Code blocks** with syntax highlighting, independent line numbers and copy feedback.
- **Rebindable shortcuts**.
- **Windows file associations** selectable by extension.
- **Four UI languages**: 简体中文, English, 日本語 and Deutsch, plus system language detection.

## Quick viewing for other text files

MDmeow can also open common configuration, code and text files such as JSON, YAML, TOML, INI, ENV, HTML, CSS, JavaScript, TypeScript, Python, Rust, logs and TXT.

These files use a lightweight **Code mode** with line numbers, syntax colors, find/replace, save, and optional customizable alternating-row tinting.

It is designed for quick inspection and small edits, not as a replacement for a full IDE.

## Downloads

Official releases cover Windows, Linux and macOS:

```text
Windows
MDmeow-<version>.exe
MDmeow_<version>_x64.msi

Linux x64
MDmeow-<version>-linux-x86_64.AppImage
MDmeow-<version>-linux-x86_64.deb
MDmeow-<version>-linux-x86_64.rpm

Linux ARM64
MDmeow-<version>-linux-aarch64.AppImage
MDmeow-<version>-linux-aarch64.deb
MDmeow-<version>-linux-aarch64.rpm

macOS
MDmeow-<version>-macOS-universal.dmg
```

### Windows

`MDmeow-<version>.exe` is the single-file portable build. `MDmeow_<version>_x64.msi` is the standard MSI installer with Chinese, English, Japanese and German installer languages.

### Linux

AppImage is the simplest option. Debian / Ubuntu users can use `.deb`; Fedora / RHEL users can use `.rpm`.

### macOS

A universal Intel + Apple Silicon `.dmg` is provided. Community builds are currently not Apple Developer ID signed/notarized.

## Markdown and images

MDmeow keeps standard Markdown first:

```md
![diagram](./assets/diagram.png)

<img src="./assets/diagram.png" alt="diagram" style="zoom:50%;" data-align="center">

<!--more-->
```

Both image forms render in the editor. Images support titles, alignment, 25%–200% scaling and deletion.

## Math

KaTeX renders inline and block equations:

```text
$E = mc^2$

$$
\int_a^b f(x)\,dx
$$
```

## Miku Cream

- bright Cream document background
- `#39C5BB` accent
- shared semantic code colors between Markdown code blocks and Code mode
- code background matches the document
- alternating code rows default to `#FAFFFF` and are configurable
- independent fonts and sizes for document and source views

## Files and windows

- drag and drop files
- multiple tabs
- optional full-path display
- optional previous-session restore
- optional window position and size memory
- when memory is disabled, the window opens centered on the primary display at a sensible size
- Windows file associations selectable by extension
- settings save immediately

## Shortcuts

| Action | Default |
| --- | --- |
| New tab | `Ctrl/Cmd+N` |
| Open | `Ctrl/Cmd+O` |
| Save | `Ctrl/Cmd+S` |
| Save As | `Ctrl/Cmd+Shift+S` |
| Close tab | `Ctrl/Cmd+W` |
| Export HTML / PDF | `Ctrl/Cmd+E` |
| Markdown render / source | `Ctrl/Cmd+/` |
| Find | `Ctrl/Cmd+F` |
| Replace | `Ctrl/Cmd+H` |
| Emoji | `Ctrl/Cmd+.` |
| Settings | `Ctrl/Cmd+,` |

## Configuration

Settings are stored in `settings.toml` and saved immediately.

```toml
language = "system"
spellcheck = true
show_path = false
open_last_session = true

code_alternate_rows = true
code_alternate_row_color = "#FAFFFF"
remember_window_position = false

accent = "#39C5BB"
auto_check_updates = true
```

## Lightweight by design

![MDmeow lightweight runtime example](docs/assets/screenshots/lightweight.png)

MDmeow is built with **Tauri + Milkdown/Crepe + CodeMirror**. It deliberately avoids turning into a heavyweight all-in-one workspace.

**When you need to work with Markdown, opening MDmeow should be enough.**

## Build

Requirements: Node.js 20+, `pnpm`, Rust stable. Windows also needs Visual C++ Build Tools, Windows SDK and WebView2.

```bash
pnpm install
pnpm build
pnpm tauri dev
```

Local Windows release:

```powershell
pnpm release:windows
```

```bash
pnpm release:linux
pnpm release:macos
```

Pushing a `vX.Y.Z` tag triggers GitHub Actions to build Windows, Linux x64, Linux ARM64 and macOS, verify the artifact set and SHA256 values, and publish one GitHub Release.

## Stack

| Layer | Technology |
| --- | --- |
| Desktop shell | Tauri v2 / Rust |
| WYSIWYG Markdown | Milkdown Crepe / ProseMirror |
| Source / Code mode | CodeMirror |
| Math | KaTeX |
| Markdown → HTML | comrak |
| Export syntax highlighting | highlight.js |
| Windows installer | WiX / MSI |

## Credits

MDmeow is based on **Ali Naderi / Mowl** and remains available under the **MIT License**.

> **Open it. Get to work.**
