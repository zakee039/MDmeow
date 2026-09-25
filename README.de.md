[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · **Deutsch**

# MDmeow

> **Öffnen und sofort arbeiten.**

MDmeow ist ein leichter, schneller und angenehm gestalteter WYSIWYG-Markdown-Editor auf Basis von **Tauri + Milkdown/Crepe**. Markdown-Dateien bleiben sauber und portabel, während die Bearbeitung direkt und natürlich bleibt.

Das Standarddesign **Miku Cream** kombiniert einen hellen Dokumenthintergrund, den Akzent `#39C5BB`, dezente Codefarben, KaTeX-Formeln, kompakte Tabellen und eine zurückhaltende Desktop-Oberfläche.

**Schnell geöffnet, angenehm zu lesen, natürlich zu bearbeiten.**

## Hauptfunktionen

- WYSIWYG-Markdown für Überschriften, Listen, Zitate, Aufgaben, Tabellen, Links, Bilder und Fußnoten
- Markdown-Quellansicht mit Zeilennummern, Syntaxfarben und dezenten Wechselzeilen
- mehrere Tabs und Sitzungswiederherstellung
- Speichern / Speichern unter
- Dateiname direkt im Titelbereich ändern
- HTML- / PDF-Export
- Markdown-Bilder und gängige HTML-`<img>`-Formen
- KaTeX-Formeln
- Codeblöcke mit Syntaxhervorhebung, Zeilennummern und Kopierfeedback
- frei belegbare Tastenkürzel
- Windows-Dateizuordnungen nach Erweiterung
- vier UI-Sprachen: 简体中文, English, 日本語 und Deutsch

## Andere Textdateien schnell ansehen

Auch JSON, YAML, TOML, INI, ENV, HTML, CSS, JavaScript, TypeScript, Python, Rust, Logs und TXT lassen sich direkt öffnen.

Sie erscheinen im leichten **Code-Modus** mit Zeilennummern, Syntaxfarben, Suchen / Ersetzen, Speichern und konfigurierbarer alternierender Zeilenfarbe.

Das ist für schnelle Kontrolle und kleine Änderungen gedacht, nicht als Ersatz für eine vollständige IDE.

## Downloads

```text
Windows
MDmeow-<version>.exe
MDmeow_<version>_x64.msi

Linux x64 / ARM64
AppImage / deb / rpm

macOS
MDmeow-<version>-macOS-universal.dmg
```

Windows bietet Portable EXE und MSI. Linux erhält AppImage / deb / rpm. Für macOS gibt es ein universelles DMG für Intel und Apple Silicon.

## Markdown, Bilder und Mathematik

Standard-Markdown steht im Vordergrund. Markdown-Bilder und gängige HTML-`<img>`-Formen werden unterstützt. Bilder können ausgerichtet, von 25% bis 200% skaliert und gelöscht werden.

KaTeX rendert Inline- und Blockformeln.

```text
$E = mc^2$

$$
\int_a^b f(x)\,dx
$$
```

## Miku Cream

- heller Cream-Hintergrund
- Akzent `#39C5BB`
- gemeinsame semantische Codefarben für Markdown-Codeblöcke und Code-Modus
- Code-Hintergrund entspricht dem Dokument
- Wechselzeilen standardmäßig `#FAFFFF`
- getrennte Schriftarten und Größen für Dokument und Quelle

## Dateien und Fenster

- Drag & Drop
- mehrere Tabs
- optional vollständiger Dateipfad
- optionale Sitzungswiederherstellung
- Fensterposition und -größe können gespeichert werden
- ohne Positionsspeicherung startet MDmeow sinnvoll zentriert auf dem Hauptbildschirm
- Windows-Dateizuordnungen nach Erweiterung
- Einstellungen werden sofort gespeichert

## Tastenkürzel

| Aktion | Standard |
| --- | --- |
| Neuer Tab | `Ctrl/Cmd+N` |
| Öffnen | `Ctrl/Cmd+O` |
| Speichern | `Ctrl/Cmd+S` |
| Speichern unter | `Ctrl/Cmd+Shift+S` |
| Tab schließen | `Ctrl/Cmd+W` |
| HTML / PDF | `Ctrl/Cmd+E` |
| Markdown Rendern / Quelle | `Ctrl/Cmd+/` |
| Suchen | `Ctrl/Cmd+F` |
| Ersetzen | `Ctrl/Cmd+H` |
| Einstellungen | `Ctrl/Cmd+,` |

## Leichtgewichtig aus Absicht

![MDmeow Beispiel für geringe Ressourcennutzung](docs/assets/screenshots/lightweight.png)

MDmeow basiert auf **Tauri + Milkdown/Crepe + CodeMirror** und versucht bewusst nicht, zu einer schweren All-in-one-Umgebung zu werden.

**Wenn Markdown ansteht, soll das Öffnen von MDmeow genügen.**

## Build

Benötigt werden Node.js 20+, `pnpm` und Rust stable.

```bash
pnpm install
pnpm build
pnpm tauri dev
```

```powershell
pnpm release:windows
```

```bash
pnpm release:linux
pnpm release:macos
```

Ein `vX.Y.Z`-Tag startet GitHub Actions für Windows, Linux x64 / ARM64 und macOS; anschließend wird ein gemeinsames Release veröffentlicht.

## Credits

MDmeow basiert auf **Ali Naderi / Mowl** und bleibt unter der **MIT License** verfügbar.

> **Öffnen und sofort arbeiten.**
