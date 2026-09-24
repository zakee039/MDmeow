[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · **Deutsch**

# MDmeow

> **Öffnen und sofort arbeiten.**
>
> **Ein leichtes, elegantes und auf Review ausgerichtetes Werkzeug für Markdown- und Code-Dokumente im KI-Zeitalter.**

[🌐 Online-Demo](https://mdmeow.zakee.fun)

Im KI-Zeitalter beginnen immer mehr Dokumente nicht auf einer leeren Seite. Agents, LLMs, Skripte und Automatisierungen erzeugen zuerst Inhalte, die anschließend von Menschen geprüft werden.

README-Dateien, Konzepte, Forschungsnotizen, JSON, YAML, Codeausschnitte und Logs folgen dadurch immer häufiger demselben Ablauf:

**öffnen → lesen → prüfen → kurz ändern → speichern.**

MDmeow ist für genau diesen Ablauf gedacht.

Es ist weder eine IDE noch eine schwere Wissensdatenbank. Es soll sich so direkt wie ein einfacher Texteditor anfühlen, so angenehm wie eine formatierte Dokumentansicht lesen lassen und gleichzeitig Markdown, Konfigurationen und Code verstehen können.

**Datei öffnen, sofort lesen, bei Bedarf direkt ändern.**

Das ist die Idee hinter MDmeow: **öffnen und sofort arbeiten.**

## Review zuerst, Bearbeitung wenn nötig

Markdown öffnet als formatierte Dokumentansicht. JSON, YAML, Python, Rust, JavaScript, Konfigurationsdateien und normaler Text öffnen direkt im leichten Code-Modus.

Farben, Zeilennummern, alternierende Zeilen und Typografie dienen der Lesbarkeit.

- AI-/Agent-Markdown prüfen
- README-Dateien, Konzepte, Forschungsnotizen und Deliverables reviewen
- JSON, YAML, TOML, INI und ENV ansehen und leicht korrigieren
- Skripte, Quellcode, Logs und Text lesen
- schnell zwischen Markdown-Darstellung und Quelle wechseln

## Zwei Modi reichen

### Markdown-Render-Modus

- WYSIWYG-Ansicht für Überschriften, Listen, Zitate, Tabellen, Links und Aufgaben
- Bilder, Formeln und Codeblöcke direkt im Dokument
- Codeblöcke mit Syntaxfarben, Zeilennummern, Kopierfeedback und subtilen Wechselzeilen
- Ctrl/Cmd + / schaltet zur Markdown-Quelle
- gespeichert wird weiterhin normales Markdown

### Code-Modus

Nicht-Markdown-Textdateien öffnen im Code-Modus.

CodeMirror-Spracherkennung und die Miku-Cream-Farbpalette helfen beim schnellen Erfassen der Struktur.

Typische Formate:

- Konfiguration / Daten: JSON, YAML, XML, TOML, INI, CONF, ENV, JSONL, CSV
- Web: HTML, CSS, SCSS, LESS, JavaScript, TypeScript, JSX, TSX, Vue
- Code: Python, Rust, C/C++, Java, Go, PHP, SQL, Shell, PowerShell, Ruby, Swift, Kotlin, C#
- Text: TXT, LOG
- weitere UTF-8-Dateien als Plain Text

Mit Zeilennummern, Syntaxfarben, Suchen/Ersetzen, Speichern und konfigurierbarer alternierender Zeilenfarbe.

**Gut zum Lesen, ausreichend zum Ändern, kein Ersatz für VS Code.**

## Miku Cream für angenehmes Lesen

- helle, ruhige Oberfläche
- Standard-Akzent #39C5BB
- gemeinsame semantische Codefarben für Markdown-Codeblöcke und Code-Modus
- Code-Hintergrund entspricht dem Dokumenthintergrund
- alternierende Zeilen standardmäßig #FAFFFF, frei konfigurierbar
- getrennte Schriftarten und Größen für Dokument- und Quellansicht

## Bilder, Mathematik und Code im Dokument

Bilder unterstützen Titel, Ausrichtung, Skalierung von 25% bis 200% und Löschen. Markdown-Bilder und HTML img verwenden dieselbe Bedienung.

KaTeX rendert Formeln:

~~~text
$E = mc^2$

$$
\int_a^b f(x)\,dx
$$
~~~

Codeblöcke besitzen Syntaxhervorhebung, eigene Zeilennummern, Kopierfeedback und dieselbe Miku-Cream-Palette wie der Code-Modus.

## Dateien natürlich öffnen

- Drag & Drop
- mehrere Tabs
- optional vollständiger Pfad
- optionale Sitzungswiederherstellung
- Fensterposition und -größe können gespeichert werden
- ohne Positionsspeicherung startet MDmeow in sinnvoller Größe mittig auf dem Hauptbildschirm
- Windows-Dateizuordnungen nach Erweiterung auswählbar
- Markdown-, Konfigurations-, Web-, Code- und Textformate registrierbar
- „Als Standard“ registriert zuerst und öffnet danach die Windows-Standard-Apps

## Export, Proxy und Updates

Markdown kann als HTML oder über den Systemdruckdialog als PDF ausgegeben werden.

HTTP/HTTPS sowie SOCKS5/SOCKS5H werden unterstützt. Dieselbe Proxy-Konfiguration kann für entfernte Bilder und GitHub-Updates verwendet werden.

Windows:

~~~text
MDmeow-<version>.exe
MDmeow_<version>_x64.msi
~~~

Linux- und macOS-Builds werden ebenfalls unterstützt.

## Leichtgewichtig aus Absicht

![MDmeow Beispiel für geringe Ressourcennutzung](docs/assets/screenshots/lightweight.png)

MDmeow basiert auf **Tauri + Milkdown/Crepe + CodeMirror**.

Es versucht nicht gleichzeitig IDE, Wissensdatenbank und komplette Schreibplattform zu sein. Gerade diese Begrenzung macht es zu einem Werkzeug, das man ohne Nachdenken immer wieder öffnen kann.

## Tastenkürzel

| Aktion | Standard |
| --- | --- |
| Neuer Tab | Ctrl/Cmd+N |
| Öffnen | Ctrl/Cmd+O |
| Speichern | Ctrl/Cmd+S |
| Speichern unter | Ctrl/Cmd+Shift+S |
| Tab schließen | Ctrl/Cmd+W |
| HTML / PDF | Ctrl/Cmd+E |
| Markdown Quelle / Rendern | Ctrl/Cmd+/ |
| Suchen | Ctrl/Cmd+F |
| Ersetzen | Ctrl/Cmd+H |
| Einstellungen | Ctrl/Cmd+, |

## Konfiguration

Einstellungen werden sofort in settings.toml gespeichert.

~~~toml
language = "system"
spellcheck = true
open_last_session = true
show_path = false

code_alternate_rows = true
code_alternate_row_color = "#FAFFFF"
remember_window_position = false

accent = "#39C5BB"
~~~

## Aus dem Quellcode bauen

Benötigt werden Node.js 20+, pnpm und Rust stable. Unter Windows zusätzlich Visual C++ Build Tools, Windows SDK und WebView2.

~~~bash
pnpm install
pnpm build
pnpm tauri dev
~~~

~~~powershell
pnpm release:windows
~~~

~~~bash
pnpm release:linux
pnpm release:macos
~~~

## Technik

| Ebene | Technologie |
| --- | --- |
| Desktop | Tauri v2 / Rust |
| Markdown Render/Edit | Milkdown Crepe / ProseMirror |
| Code-Modus | CodeMirror |
| Mathematik | KaTeX |
| Markdown → HTML | comrak |
| Export-Syntaxhervorhebung | highlight.js |
| Windows-Installer | WiX / MSI |

## Credits

MDmeow basiert auf **Ali Naderi / Mowl** und bleibt unter der **MIT License** verfügbar.

MDmeow hat daraus eine eigene Richtung entwickelt: Markdown, Code und AI-generierte Dokumente **schneller zu öffnen, angenehmer zu lesen und bei Bedarf leicht zu korrigieren**.

> **Öffnen und sofort arbeiten.**
