![Mowl](docs/logo.png)

**English** · [简体中文](README.zh-CN.md) · [Deutsch](README.de.md) · [فارسی](README.fa.md) · [العربية](README.ar.md) · [עברית](README.he.md)

# Mowl

A small, fast WYSIWYG Markdown editor built with Tauri and Milkdown. Mowl keeps the file on disk as ordinary Markdown while giving you a Typora-style inline editing experience.

This edition uses **Miku Cream** as the built-in rendering system: cream document surfaces, `#39C5BB` accents, a light syntax-highlighting palette, KaTeX math, compact tables, and restrained UI chrome.

## Highlights

- **Inline WYSIWYG Markdown** — headings, lists, quotes, task lists, tables, links, images, footnotes and more.
- **Miku Cream rendering** — one consistent light rendering system for prose, code, math, tables and export.
- **Light code blocks** — Consolas-first code typography, 18 px line rhythm, subtle alternating line surfaces, and clear teal / blue / pink / dark-red syntax colours.
- **KaTeX math** — inline `$…$` and display `$$…$$` formulas.
- **Source view** — raw Markdown with a separate gray line-number gutter; default shortcut `Ctrl/Cmd+/`.
- **Markdown image compatibility** — standard `![alt](path)` images plus common raw HTML `<img ...>` blocks. Relative local paths are resolved against the Markdown file.
- **Blog marker compatibility** — `<!--more-->` remains in Markdown but is hidden in the WYSIWYG view.
- **Configurable shortcuts** — click a shortcut field in Settings and press the new key combination.
- **English / Deutsch / 简体中文** — UI language can follow the OS or be selected explicitly.
- **LTR / RTL writing** — new documents default to left-to-right; document direction can be switched from the toolbar.
- **Tabs and session restore** — reopen the documents from your previous session.
- **Portable settings** — `settings.toml` normally lives beside the executable and is reloaded live.
- **HTML / PDF export** — self-contained HTML with offline KaTeX and syntax highlighting; PDF through the system print dialog.

## Markdown rendering

Mowl intentionally keeps Markdown portable. Standard Markdown is preferred, but a small compatibility layer handles common raw HTML used by note apps and blogging workflows.

```md
![diagram](./assets/diagram.png)

<img src="./assets/diagram.png" alt="diagram" style="zoom:50%;" data-align="center">

<!--more-->
```

Both image forms are rendered in the editor. For raw HTML images, Mowl preserves the original HTML in the Markdown document while using safe display attributes for the WYSIWYG view. `<!--more-->` is preserved but not visibly rendered.

## Miku Cream code rendering

Code blocks use a light palette rather than a dark editor theme. The default code stack starts with `Consolas`, followed by `Courier New` / `Courier` fallbacks. The layout uses an 18 px line rhythm and slightly different solid backgrounds on adjacent lines to make long snippets easier to scan without a translucent or blurred appearance.

The syntax palette centers on Miku teal (`#39C5BB`) with distinct solid colours for keywords, functions, strings, numeric literals, types, operators and comments. HTML/PDF export uses the same visual direction.

## Source view

Press **`Ctrl/Cmd+/`** or use the source button in the toolbar to switch between WYSIWYG and raw Markdown. Source view always remains left-to-right and now includes a gray line-number gutter outside the editable text area. `Tab` / `Shift+Tab` indent and outdent selected lines.

## Images

Standard Markdown image paths can be remote URLs, absolute local paths, or paths relative to the current Markdown file. Raw HTML `<img>` blocks support the same path resolution and common presentation attributes such as `width`, `height`, `data-align`, and numeric `zoom` styles.

## Keyboard shortcuts

Application shortcuts can be rebound in **Settings → Shortcuts**. These are the defaults:

| Action | Default |
| --- | --- |
| New tab | `Ctrl/Cmd+N` |
| Open | `Ctrl/Cmd+O` |
| Save | `Ctrl/Cmd+S` |
| Save As | `Ctrl/Cmd+Shift+S` |
| Close tab | `Ctrl/Cmd+W` |
| Export HTML / PDF | `Ctrl/Cmd+E` |
| Toggle source view | `Ctrl/Cmd+/` |
| Find | `Ctrl/Cmd+F` |
| Replace | `Ctrl/Cmd+H` |
| Link from clipboard | `Ctrl/Cmd+K` |
| Emoji picker | `Ctrl/Cmd+.` |
| Settings | `Ctrl/Cmd+,` |
| Block type: Text / H1–H3 / lists / quote / code | `Ctrl/Cmd+0`–`7` |

## Settings

The settings panel opens with a short fade and saves changes immediately. Settings include language, default writing direction, spell-check, list marker, session behavior, fonts, font sizes, accent colour, and application shortcuts.

`settings.toml` is watched for external edits, so most hand-edited preferences take effect without restarting Mowl. If the executable directory is read-only, Mowl falls back to the OS configuration directory.

A generated `settings.example.toml` is included with release builds.

## Screenshots

| Right-to-left document | Block menu |
| --- | --- |
| ![Right-to-left document](docs/screenshot-rtl.png) | ![Block menu](docs/screenshot-block-menu.png) |

## Windows builds

A normal Tauri release build produces:

- portable `mowl.exe`
- NSIS setup executable
- MSI installer

The portable executable does not require a separate installation. Windows may show a SmartScreen warning because community builds are not code-signed.

## Building

### Requirements

- Node.js 20+
- `pnpm`
- Rust stable; Windows uses the `x86_64-pc-windows-msvc` toolchain
- Tauri platform prerequisites (Visual C++ Build Tools / Windows SDK / WebView2 on Windows)

```bash
pnpm install
pnpm build
pnpm tauri dev
pnpm tauri build
```

Useful checks:

```bash
pnpm exec tsc --noEmit
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

## Configuration example

```toml
language = "system"         # system | en | de | zh-CN
direction = "ltr"           # default for new documents
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
accent = ""

[shortcuts]
toggle_source = "Mod+/"
```

`Mod` means Ctrl on Windows/Linux and Cmd on macOS.

## Tech stack

| Layer | Technology |
| --- | --- |
| Desktop shell | Tauri v2 / Rust |
| WYSIWYG editor | Milkdown Crepe / ProseMirror |
| Code editing | CodeMirror |
| Math | KaTeX |
| Markdown → HTML | comrak |
| Syntax highlighting in export | highlight.js |

See [ARCHITECTURE.md](ARCHITECTURE.md) for the code map and extension points.

## Credits and license

Mowl was created by **Ali Naderi** and is distributed under the **MIT License**. This codebase keeps that credit while extending the editor with localization, configurable shortcuts, compatibility fixes, and the Miku Cream rendering system.
