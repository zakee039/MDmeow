![MDmeow](docs/logo.png)

[English](README.md) · **Deutsch** · [فارسی](README.fa.md) · [العربية](README.ar.md) · [עברית](README.he.md)

> ℹ️ Diese Übersetzung wurde maschinell erstellt. Maßgeblich ist das englische
> [README](README.md).

# MDmeow

**Ein minimalistischer, portabler WYSIWYG‑Markdown‑Editor.**

Markdown tippen, sofort formatiert sehen — im Typora‑Stil. Mächtig genug für
echtes Schreiben (Tabellen, Formeln, Code, Fußnoten), und trotzdem eine
einzige \~7‑MB‑Anwendung, die sofort startet und nicht im Weg steht.

[Funktionen](#funktionen) · [Screenshots](#screenshots) · [Download](#download) · [Konfiguration](#konfiguration) · [Selbst bauen](#selbst-bauen)

***

## Warum MDmeow

- **Überraschend mächtig.** Inline‑WYSIWYG‑Bearbeitung, Dokumente in Tabs, ein
  Blockmenü, GFM‑Tabellen mit Ziehen zum Umsortieren, KaTeX‑Formeln,
  syntaxhervorgehobener Code, Suchen & Ersetzen und in sich geschlossener
  HTML‑/PDF‑Export.
- **Extrem schlank.** Kein Electron. MDmeow baut auf [Tauri](https://tauri.app) und
  der WebView deines Betriebssystems auf, sodass die ganze App eine **einzige
  portable Anwendung von rund 7 MB** ist — kein Installer nötig, nichts zu
  entpacken, keine Hintergrunddienste.
- **Wirklich schnell.** Der Kern ist Rust, das Fenster nativ, und der Kaltstart
  praktisch sofort. Es fühlt sich wie ein Texteditor an, nicht wie eine Web‑App.
- **Portabel von Grund auf.** Eine einzige, von Hand editierbare `settings.toml`
  liegt neben der Anwendung. Zieh `mdmeow.exe` auf einen USB‑Stick und deine
  Einstellungen reisen mit.

## Funktionen

### ✍️ Inline‑WYSIWYG‑Bearbeitung

Angetrieben von [Milkdown Crepe](https://milkdown.dev) (ProseMirror).
Überschriften, Fettdruck, Listen, Zitate und der Rest werden beim Tippen
formatiert — das Dokument auf der Festplatte bleibt aber immer schlichtes,
portables Markdown.

### 🔗 Links ohne Syntax‑Gefummel

Text markieren, dann **eine URL mit `Strg/Cmd+V` einfügen** — die Markierung wird
zum Linktext, die eingefügte URL zum Ziel. Kein `[]()`‑Tippen, kein Dialog.
Lieber die Tastatur? Text markieren und **`Strg/Cmd+K`** drücken, um daraus einen
Link mit der URL aus der Zwischenablage zu machen (oder einen leeren Link zum
Ausfüllen).

### 🖼️ Bilder, die einfach da sind

`![alt](bild.png)` wird im Editor inline dargestellt, auch bei **relativen
Pfaden**, die gegen den Ordner des Dokuments aufgelöst werden
(`./assets/diagramm.png`, `../shared/logo.svg`), und bei absoluten lokalen Pfaden
— nicht nur bei `http(s)`‑URLs. Über das `⠿`‑Blockmenü hinzufügen („Image"), dann
einen Link einfügen oder eine Datei auswählen.

### 🧱 Blockmenü

Über einen Block fahren und auf den `⠿`‑Knopf klicken für ein Schnellmenü, das auf
diesen Block wirkt:

- **Umwandeln in** — Text, Überschrift 1–3, Stichpunktliste, nummerierte Liste, Zitat,
  Codeblock oder **Tabelle**
- **Einfügen** einer Tabelle, eines Bildes, einer Trennlinie oder einer leeren
  Zeile darüber/darunter
- Block **duplizieren** oder **löschen**

Der aktuelle Blocktyp ist hervorgehoben, damit du immer weißt, was du bearbeitest.
Die „Umwandeln in"-Typen haben auch Tastenkürzel — `Strg/Cmd+0`–`7` (Text, Ü1, Ü2,
Ü3, Stichpunktliste, nummerierte Liste, Zitat, Codeblock) — angewendet auf die Auswahl,
genau wie im Menü.

### 😀 Emoji

`Strg/Cmd+.` öffnet eine durchsuchbare Emoji-Auswahl, oder tippe einfach einen
`:shortcode:` (z. B. `:tada:` → 🎉, `:+1:` → 👍) — er wird beim schließenden
Doppelpunkt zum Emoji. Natives Unicode, keine Bilder, nichts wird geladen.

### 📑 Tabs mit Sitzungswiederherstellung

Mehrere Dokumente als Tabs öffnen. MDmeow schließen, wieder öffnen, und deine Tabs —
samt Scrollpositionen — sind zurück. (In der Konfiguration abschaltbar.)

### 👁️ Quelltextansicht

Mit `Strg/Cmd+/` zwischen dem formatierten Editor und dem **rohen Markdown**
in einem einfachen Textfeld umschalten. `Tab` / `Shift+Tab` rücken markierte
Zeilen ein und aus, und das native Rückgängig funktioniert weiter. Die
Leseposition wird beim Umschalten übernommen.

### 🔍 Suchen & Ersetzen

`Strg/Cmd+F` zum Suchen, `Strg/Cmd+H` zum Ersetzen — funktioniert sowohl im
WYSIWYG‑Editor als auch in der Quelltextansicht.

### 📊 Tabellen, die sich benehmen

Vollständige GitHub‑Flavored‑Markdown‑Tabellen. **Zeilen und Spalten ziehen**, um
sie umzusortieren, eine Tabelle direkt aus dem Blockmenü einfügen, und von Hand
getippte Tabellen werden in der gespeicherten `.md`‑Datei automatisch
**ausgerichtet und aufgefüllt**, damit das rohe Markdown lesbar bleibt.

### 🧮 Formeln & 💻 Code

- **KaTeX**‑Formeln, inline (`$…$`) und abgesetzt (`$$…$$`)
- Syntaxhervorgehobene **Codeblöcke** mit Spracherkennung

Dazu der Rest von GFM: Aufgabenlisten, Fußnoten, Durchstreichen, Autolinks.

### 📤 Export

- **In sich geschlossenes HTML** — eine einzige Datei mit eingebetteten KaTeX‑ und
  Hervorhebungs‑Styles, nichts zu hosten. Lokale Bilder werden als Data‑URLs
  eingebettet.
- **PDF** über den System‑Druckdialog

### 🎨 Miku Cream & Erscheinungsbild

MDmeow verwendet **Miku Cream** als einheitliches Rendering für Dokumente,
Codeblöcke, KaTeX-Formeln, Tabellen, Zitate, Listen und Bilder. Editor‑Schrift,
Schriftgröße, Quelltext‑Schrift und Akzentfarbe sind konfigurierbar.

### 🗂️ Dateizuordnungen

MDmeow als Standard‑App für `.md`‑/`.markdown`‑Dateien festlegen (über den
Installer). Ein Doppelklick auf eine Markdown‑Datei öffnet sie in einem neuen Tab
des laufenden Fensters.

### ⚙️ Einstellungen, per GUI oder Datei

Jede Einstellung lässt sich in der App ändern — der Einstellungen-Knopf in der
Toolbar (oder `Strg/Cmd+,`) klappt die Einstellungsseite über den Editor herein,
mit einem Bedienelement pro Option; Änderungen werden sofort angewendet und
gespeichert. Oder die einzige, kommentierte `settings.toml` neben der Anwendung
in einem beliebigen Texteditor bearbeiten — MDmeow **übernimmt die Änderung
innerhalb einer Sekunde, ohne Neustart**. Ist der Programmordner schreibgeschützt,
weicht MDmeow auf das Konfigurationsverzeichnis des Betriebssystems aus und weist im
Fenster darauf hin. Jede Veröffentlichung bringt außerdem eine vollständig
kommentierte `settings.example.toml` mit.

### 🌍 English und Deutsch

Die Oberfläche gibt es auf **Englisch und Deutsch** und folgt standardmäßig der
Systemsprache (`language = "system" | "en" | "de"`, umschaltbar in den
Einstellungen).

## Screenshots

| Hell                                                               | Dunkel                                           |
| ------------------------------------------------------------------ | ------------------------------------------------ |
| ![MDmeow beim Bearbeiten eines Dokuments](docs/screenshot-light.png) | ![MDmeow im Dunkelmodus](docs/screenshot-dark.png) |

![Blockmenü am ⠿-Knopf](docs/screenshot-block-menu.png)

## Tastenkürzel

| Aktion                           | Kürzel             |
| -------------------------------- | ------------------ |
| Neuer Tab                        | `Strg/Cmd+N`       |
| Öffnen                           | `Strg/Cmd+O`       |
| Speichern                        | `Strg/Cmd+S`       |
| Speichern unter                  | `Strg/Cmd+Shift+S` |
| Tab schließen                    | `Strg/Cmd+W`       |
| Export (HTML / PDF)              | `Strg/Cmd+E`       |
| Quelltextansicht umschalten      | `Strg/Cmd+/` |
| Suchen                           | `Strg/Cmd+F`       |
| Ersetzen                         | `Strg/Cmd+H`       |
| Link aus Zwischenablage          | `Strg/Cmd+K`       |
| URL auf markierten Text einfügen | `Strg/Cmd+V`       |
| Block: Text / Ü1–Ü3 / Listen / Zitat / Code | `Strg/Cmd+0`–`7` |
| Emoji einfügen                   | `Strg/Cmd+.`       |
| Einstellungen                    | `Strg/Cmd+,`       |

## Download

Den aktuellen Build gibt es auf der Seite [Releases](../../releases).

- **Windows (x64)** — jetzt verfügbar: portable `mdmeow.exe` (\~7 MB, ohne
  Installation) oder der NSIS‑Installer
- **macOS** (x64 + arm64) und **Linux** (x64 + arm64 AppImage) — *demnächst.*
  Die plattformübergreifende Release‑Pipeline steht bereits
  ([`.github/workflows/release.yml`](.github/workflows/release.yml)); diese Builds
  kommen mit einer künftigen getaggten Veröffentlichung. Bis dahin auf dem
  Zielsystem aus dem Quellcode bauen (siehe [Selbst bauen](#selbst-bauen)) — MDmeow
  ist eine Tauri‑App und läuft auf allen dreien.

Die Builds sind **nicht** signiert oder notarisiert, das Betriebssystem kann beim
ersten Start also warnen:

- **Windows** — SmartScreen: *Weitere Informationen → Trotzdem ausführen*
- **macOS** — Rechtsklick auf die App → *Öffnen*, oder
  `xattr -dr com.apple.quarantine /pfad/zu/MDmeow.app`
- **Linux** — `chmod +x MDmeow*.AppImage` und ausführen

Zu jeder Veröffentlichung werden SHA‑256‑Prüfsummen bereitgestellt.

## Konfiguration

`settings.toml` liegt neben der Anwendung (unter macOS: neben dem `.app`‑Bundle)
oder ersatzweise im Konfigurationsverzeichnis des Betriebssystems. Der obere
Abschnitt ist für die Bearbeitung von Hand gedacht und wird live neu geladen
(die `#`‑Kommentare bleiben auf Englisch, wie in der Datei):

```toml
language = "system"         # system (follow the OS) | en | de
spellcheck = true
quit_on_escape = false      # press Esc to quit
list_marker = "*"           # bullet-list marker on save: * | - | +
show_path = false           # show the full file path in the header, not just the name
open_last_session = true    # reopen the previous session's tabs on startup
always_show_tabbar = false  # keep the tab bar visible even with only one file open
editor_font = ""            # WYSIWYG font family (blank = default)
editor_font_size = 16       # headings scale from this
source_font = ""            # Markdown source font (monospace)
source_font_size = 15
accent = "#39C5BB"         # accent colour; reset/default is Miku teal

# below this line: managed by the app — window geometry, open tabs
```

## Selbst bauen

Voraussetzungen:

- Rust (stable; MSVC‑Toolchain unter Windows) — <https://rustup.rs>
- Node 20+ und `pnpm`
- Plattform‑WebView‑Abhängigkeiten — siehe <https://tauri.app/start/prerequisites/>

```bash
pnpm install
pnpm tauri dev                       # mit Hot-Reload starten
pnpm tauri build                     # Release-Bundles für das Host-OS
pnpm tauri build --bundles nsis      # Windows: Installer + portable exe
pnpm exec tsc --noEmit               # Frontend-Typecheck
cargo test --manifest-path src-tauri/Cargo.toml   # Rust-Unit-Tests
```

**Eine Veröffentlichung schneiden:** `version` in **beiden** Dateien
`package.json` und `src-tauri/tauri.conf.json` erhöhen, dann einen `v*`‑Tag
pushen — `.github/workflows/release.yml` baut Windows / macOS / Linux
(x64 + arm64) und öffnet einen GitHub‑Release‑Entwurf mit Prüfsummen.

MDmeow erweitern? Lies **[ARCHITECTURE.md](ARCHITECTURE.md)** — dort ist jede Datei
verzeichnet und es wird gezeigt, wie man Toolbar‑Knöpfe, Blockmenü‑Einträge,
Einstellungen und Kommandos hinzufügt.

## Technik‑Stack

| Ebene                  | Wahl                                                    |
| ---------------------- | ------------------------------------------------------- |
| Hülle                  | [Tauri v2](https://tauri.app) (Rust, System‑WebView)    |
| Editor                 | [`@milkdown/crepe`](https://milkdown.dev) (ProseMirror) |
| Markdown → HTML‑Export | [`comrak`](https://github.com/kivikakk/comrak) (Rust)   |
| Formeln                | [KaTeX](https://katex.org)                              |
