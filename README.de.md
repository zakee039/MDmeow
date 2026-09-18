![MDmeow](docs/logo.png)

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · **Deutsch**

# MDmeow

MDmeow ist ein kleiner, schneller WYSIWYG-Markdown-Editor auf Basis von **Tauri + Milkdown/Crepe**. Die Dateien bleiben normales Markdown, während die Bearbeitung direkt in der formatierten Ansicht erfolgt.

Die aktuelle Ausgabe verwendet das **Miku-Cream**-Rendering: helle Dokumentflächen, `#39C5BB` als Akzentfarbe, helle Syntaxhervorhebung, KaTeX, kompakte Tabellen und eine zurückhaltende Desktop-Oberfläche.

## Funktionen

- WYSIWYG-Bearbeitung für Markdown.
- Markdown-Quellansicht mit Zeilennummern.
- Tabs und Wiederherstellung der letzten Sitzung.
- Getrennte Schaltflächen für **Speichern** und **Speichern unter**.
- Dateiname in der Titelleiste anklicken und direkt umbenennen.
- Eigenständiger HTML-Export und PDF-Ausgabe über den Systemdruckdialog.
- Markdown-Bilder sowie gängige HTML-`<img>`-Blöcke.
- KaTeX-Mathematik.
- Frei belegbare App-Kurzbefehle.
- Windows-„Öffnen mit“-Integration über `MDmeow.Markdown`.
- Benutzeroberfläche in 简体中文, English, 日本語 und Deutsch.

## Veröffentlichungen

Offizielle Releases werden für Windows, Linux und macOS erzeugt:

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

Unter Windows ist die EXE die portable Einzeldatei; die MSI ist die installierte Variante mit chinesischer, englischer, japanischer und deutscher Installationssprache.

Linux wird als AppImage, deb und rpm für x64 sowie ARM64 bereitgestellt. Einstellungen liegen unter `~/.config/MDmeow`, lokale Daten unter `~/.local/share/MDmeow`.

Für macOS gibt es ein universelles DMG für Intel und Apple Silicon. Einstellungen liegen unter `~/Library/Application Support/MDmeow`. Die Community-Builds sind derzeit nicht signiert/notarisiert, daher kann beim ersten Start Rechtsklick → „Öffnen“ nötig sein.

## Sprachen

- 简体中文 (`zh-CN`)
- English (`en`)
- 日本語 (`ja`)
- Deutsch (`de`)
- System (`system`)

Der Systemmodus ordnet nur diese vier Sprachen automatisch zu; andere Betriebssystemsprachen fallen auf English zurück.

## Tastenkürzel

| Aktion | Standard |
| --- | --- |
| Neuer Tab | `Ctrl/Cmd+N` |
| Öffnen | `Ctrl/Cmd+O` |
| Speichern | `Ctrl/Cmd+S` |
| Speichern unter | `Ctrl/Cmd+Shift+S` |
| Tab schließen | `Ctrl/Cmd+W` |
| HTML / PDF exportieren | `Ctrl/Cmd+E` |
| Quellansicht umschalten | `Ctrl/Cmd+/` |
| Suchen | `Ctrl/Cmd+F` |
| Ersetzen | `Ctrl/Cmd+H` |
| Emoji | `Ctrl/Cmd+.` |
| Einstellungen | `Ctrl/Cmd+,` |

## Konfiguration

```toml
language = "system"         # system | zh-CN | en | ja | de
spellcheck = true
quit_on_escape = false
list_marker = "*"
show_path = false
open_last_session = true
always_show_tabbar = false
accent = "#39C5BB"
```

## Bauen

Voraussetzungen: Node.js 20+, `pnpm`, Rust stable und die normalen Tauri-Plattformabhängigkeiten.

```bash
pnpm install
pnpm build
pnpm tauri dev
```

Finale Release-Builds pro Plattform:

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

Jeder Befehl schreibt nur die öffentlichen Artefakte der jeweiligen Plattform in `release/`. Beim Push eines Versions-Tags baut GitHub Actions Linux x64/ARM64 und macOS universal automatisch und erzeugt zusätzlich `SHA256SUMS.txt`. Die Windows-EXE/MSI werden lokal gebaut und vom Maintainer manuell hochgeladen.

## Technik

| Ebene | Technologie |
| --- | --- |
| Desktop | Tauri v2 / Rust |
| WYSIWYG | Milkdown Crepe / ProseMirror |
| Quelltext | CodeMirror |
| Mathematik | KaTeX |
| Markdown → HTML | comrak |
| Windows-Installer | WiX / MSI |

## Credits und Lizenz

MDmeow basiert auf **Ali Naderi / Mowl** und wird weiterhin unter der **MIT License** veröffentlicht. Dieser Fork wird von **zakee039** gepflegt.
