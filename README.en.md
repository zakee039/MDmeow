[简体中文](README.md) · **English** · [日本語](README.ja.md) · [Deutsch](README.de.md)

# MDmeow

> **Open Markdown. Get straight to work.**
>
> **A lightweight WYSIWYG Markdown editor for the AI era.**

As we work with AI agents more often, **Markdown is becoming one of the most common document formats shared between people and AI**.

Specs, development notes, AI output, research notes, README files—more and more of our daily work ends up in a `.md` file.

But most of the time, you do not need another heavyweight writing platform. You need a Markdown editor that **opens quickly, edits what you see, and stays out of the way**.

That is why **MDmeow** exists.

Its goal is simple:

**Open Markdown as quickly as a text file, then edit it as naturally as a normal document.**

Lightweight, quiet, and focused. Whether you are reviewing an AI-generated document, updating a README, or jotting down notes, open the file and start working.

## Lightweight is part of the product

![MDmeow lightweight runtime example](docs/assets/screenshots/lightweight.png)

> The screenshot shows an empty document on one Windows machine. Actual resource usage varies with document content, WebView2, and the system environment.

MDmeow is built with **Tauri + Milkdown/Crepe**. It is not trying to become a large knowledge-management suite. It is designed to be a practical desktop editor for everyday Markdown work.

## Why MDmeow

### WYSIWYG, without giving up Markdown

You work in a formatted document view, while the file on disk remains readable Markdown.

- Edit headings, lists, quotes, task lists, tables, links, footnotes, and other common Markdown directly
- Switch to a dedicated **source view** at any time
- Keep Markdown files portable instead of locking content into a private format
- Support both standard Markdown images and common raw HTML `<img>` blocks
- Preserve content such as `<!--more-->` in source without cluttering the WYSIWYG view

MDmeow should fit into your workflow, not own it.

### Images should be easy to edit too

Click an image to open a compact image toolbar:

- Edit the image title
- Align left / center / right
- Scale from 25% to 200%
- Delete the image
- Use the same interaction for Markdown images and raw HTML images

When an image needs presentation metadata such as scale or alignment, MDmeow uses HTML that is highly compatible with Typedown:

```html
<img title="diagram" src="./assets/diagram.png" alt="diagram" style="zoom:50%;" data-align="center">
```

Relative image paths are still resolved from the current Markdown file.

### Code and math belong in the same editor

MDmeow ships with the **Miku Cream** document rendering style:

- Light code blocks
- Syntax highlighting
- Dedicated code line numbers
- Copy button with success feedback
- Clear inline-code hierarchy
- KaTeX inline and display math
- Formula blocks stay in preview mode until you click in to edit the source

For example:

```text
$E = mc^2$

$$
\int_a^b f(x)\,dx
$$
```

### Opening a file should feel natural

- Drag in `.md`, `.markdown`, `.mdx`, or `.txt` files
- Register MDmeow as a Windows “Open with” target for Markdown
- Let the installed build own file associations when present
- Let the portable build act as the fallback when no valid installation exists
- Click the filename in the title bar to rename the current document
- Work with multiple tabs
- Restore the previous session

### HTML / PDF export without another tool

The export button offers two clear outputs:

- **Export HTML**: create a standalone page
- **Export PDF**: use the system print flow to generate a PDF

Write the document once, then hand it off without opening another editor.

### Proxy support for remote content

If your Markdown references GitHub Raw, an image host, or other remote resources, MDmeow can use a configurable proxy:

- HTTP / HTTPS
- SOCKS5 / SOCKS5H
- Built-in connection test
- Keep and edit the address even while the proxy is disabled
- Reuse the same proxy configuration for remote images and update traffic

Examples:

```text
http://127.0.0.1:7897
socks5://127.0.0.1:7893
```

### Updates directly from GitHub

MDmeow can check GitHub Releases for a newer version and verifies downloaded update artifacts with signatures.

On Windows:

- **Installed build**: download the new MSI and start the update flow
- **Portable build**: download the new EXE beside the current program
- The portable build never silently overwrites the running executable
- Check manually at any time
- Background checks run at most once every 24 hours by default
- Failed automatic checks stay silent and do not interrupt editing

GitHub Releases are the update service—no extra update server is required.

## More everyday conveniences

- **Four UI languages**: 简体中文, English, 日本語, Deutsch
- **Rebindable shortcuts**
- **Separate editor/source fonts and sizes**
- **Configurable accent color**, defaulting to `#39C5BB`
- **Spellcheck**
- Options such as showing full paths or always showing the tab bar
- **Portable EXE and MSI installer** with behavior suited to each mode

## Download

Latest release:

**https://github.com/zakee039/MDmeow/releases/latest**

### Windows

Choose the build that fits your workflow:

```text
MDmeow-<version>.exe
```

Single-file portable build. Put it in a tools folder, on a USB drive, or anywhere you want to run MDmeow without installing it.

```text
MDmeow_<version>_x64.msi
```

Standard MSI installer for long-term use and Windows file associations.

The repository also keeps Linux and macOS build workflows. If the release page does not contain a package for your platform, you can build MDmeow from source.

## Shortcuts

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
| Emoji picker | `Ctrl/Cmd+.` |
| Settings | `Ctrl/Cmd+,` |
| Change block type | `Ctrl/Cmd+0` – `7` |

All application shortcuts can be rebound in **Settings → Shortcuts**.

## Configuration

MDmeow stores settings in `settings.toml` and supports hot reload.

Common options:

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

`Mod` means Ctrl on Windows/Linux and Cmd on macOS.

## Build from source

Requirements:

- Node.js 20+
- `pnpm`
- Rust stable
- Windows: Visual C++ Build Tools, Windows SDK, WebView2

Development:

```bash
pnpm install
pnpm build
pnpm tauri dev
```

Release builds:

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

Useful checks:

```bash
pnpm exec tsc --noEmit
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

## Stack

| Layer | Technology |
| --- | --- |
| Desktop shell | Tauri v2 / Rust |
| WYSIWYG editor | Milkdown Crepe / ProseMirror |
| Source editing | CodeMirror |
| Math | KaTeX |
| Markdown → HTML | comrak |
| Export syntax highlighting | highlight.js |
| Windows installer | WiX / MSI |

## Credits

MDmeow is based on **Ali Naderi / Mowl** and remains available under the **MIT License**.

Thanks to the upstream project for providing a clean and elegant starting point.

From there, MDmeow has been rebuilt around practical desktop workflows: WYSIWYG/source dual views, Miku Cream rendering, image editing, code and math improvements, HTML/PDF export, localization, shortcuts, Windows file associations, portable/installed modes, proxy support, and signed GitHub updates.

> **Open Markdown. Get straight to work.**
