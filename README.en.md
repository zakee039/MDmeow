![MDmeow](docs/logo.png)

[简体中文](README.md) · **English** · [日本語](README.ja.md) · [Deutsch](README.de.md)

# MDmeow

MDmeow is a small and fast WYSIWYG Markdown editor built with **Tauri + Milkdown/Crepe**. It keeps documents as ordinary Markdown files while providing a Typora-like inline editing experience.

The current edition uses the **Miku Cream** rendering system: light document surfaces, `#39C5BB` accents, light syntax highlighting, KaTeX math, compact tables, and restrained desktop chrome.

## Highlights

- Inline WYSIWYG Markdown editing.
- Raw Markdown source view with line numbers.
- Tabs and previous-session restore.
- Dedicated **Save** and **Save As** toolbar buttons.
- Click the filename in the title bar to rename the current file in place.
- Self-contained HTML export and PDF export through the system print flow.
- Standard Markdown images plus common raw HTML `<img>` compatibility.
- KaTeX inline and display math.
- Rebindable application shortcuts.
- Windows “Open with” integration using the unified `MDmeow.Markdown` ProgID.
- Four UI languages: 简体中文, English, 日本語, and Deutsch.

## Releases

Official releases cover Windows, Linux, and macOS:

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

On Windows, the versioned EXE is the single-file portable build and the MSI is the installed build with a Chinese / English / Japanese / German installer. A valid MSI installation owns the Markdown registration; the portable build only acts as a fallback.

On Linux, AppImage is the easiest portable-style package, while `.deb` and `.rpm` integrate with the package manager. Settings use `~/.config/MDmeow` and local data uses `~/.local/share/MDmeow`.

On macOS, the universal DMG supports both Intel and Apple Silicon. Settings live under `~/Library/Application Support/MDmeow`. Community builds are currently unsigned/not notarized, so Gatekeeper may require right-click → Open on first launch.

## Languages

Supported UI languages:

- 简体中文 (`zh-CN`)
- English (`en`)
- 日本語 (`ja`)
- Deutsch (`de`)
- System (`system`)

System mode maps only to these four languages; unsupported OS locales fall back to English.

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

All application shortcuts can be rebound in Settings.

## Configuration

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

## Build

Requirements: Node.js 20+, `pnpm`, Rust stable, and the normal Tauri platform prerequisites.

```bash
pnpm install
pnpm build
pnpm tauri dev
```

Final platform release builds:

```powershell
# Windows
pnpm release:windows
```

```bash
# Linux
pnpm release:linux

# macOS universal
pnpm release:macos
```

Each command writes only that platform's public artifacts into the repository-root `release/` directory. Pushing a version tag automatically builds Linux x64/ARM64 and macOS universal in GitHub Actions, verifies those artifacts, and publishes `SHA256SUMS.txt`. Windows EXE/MSI are built locally and uploaded manually by the maintainer.

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

## Credits and license

MDmeow is based on **Ali Naderi / Mowl** and remains distributed under the **MIT License**. This fork is maintained by **zakee039**.
