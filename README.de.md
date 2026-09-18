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

## Windows-Veröffentlichung

Es werden genau zwei öffentliche Artefakte erzeugt:

```text
MDmeow-<version>.exe
MDmeow_<version>_x64.msi
```

Die EXE ist die portable Einzeldatei. Die MSI ist die installierte Variante und enthält eine Sprachauswahl für Chinesisch, Englisch, Japanisch und Deutsch.

Die portable Variante speichert `settings.toml` und `data/` neben der EXE. Die MSI-Variante verwendet `%APPDATA%\MDmeow` und `%LOCALAPPDATA%\MDmeow`.

Eine gültige MSI-Installation hat bei der Windows-Dateizuordnung Vorrang. Nur wenn keine gültige Installation vorhanden ist, darf die portable Ausgabe sich als Fallback registrieren.

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

Finaler Windows-Release:

```powershell
pnpm release:windows
```

Die beiden öffentlichen Dateien werden in `release/` im Repository-Stamm abgelegt.

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
