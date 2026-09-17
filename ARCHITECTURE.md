# Mowl — Architecture & extension guide

Everything you need to pick this project up again months from now. Read this
before changing anything non‑trivial.

---

## 1. Big picture

Mowl is a **Tauri v2** desktop app:

```
┌───────────────────────────────────────────────┐
│  Rust  (src-tauri/)                            │
│  • window, native dialogs                      │
│  • #[tauri::command] functions                 │
│  • settings.toml  (portable, watched)          │
│  • single-instance + file associations         │
│  • Markdown → HTML export (comrak)             │
│  • GFM table pretty-printer                    │
├───────────────────────────────────────────────┤
│  Frontend  (src/)  — TypeScript + Vite,        │
│  no framework                                  │
│  • Milkdown "Crepe" editor (WYSIWYG)           │
│  • tab strip, source-view textarea            │
│  • toolbar, block (⠿) menu, Miku Cream, RTL    │
└───────────────────────────────────────────────┘
```

The frontend never touches the filesystem directly — it calls Rust commands via
`invoke(...)`. Rust never renders UI — it returns data / emits events.

**Why this stack:** a real inline‑WYSIWYG Markdown editor needs a browser
rich‑text engine (ProseMirror via Milkdown Crepe). Tauri gives that a small,
portable native shell using the OS WebView instead of bundling Chromium.

---

## 2. Repo layout

| Path | What |
|---|---|
| `index.html` | The single page. Toolbar buttons live here as static markup. |
| `src/main.ts` | **Orchestrator.** App state, all wiring, every command call. Start here. |
| `src/editor.ts` | Thin wrapper over one Crepe instance (`init` / `setContent` / `getMarkdown` / `setDirection` / `setSpellcheck` / `setDocPath` / `runBlockAction` / `insertText` / `retranslate`). Also the image `proxyDomURL` hook — see §4, `.use(emojiInputRule)`, and the translated `Placeholder` feature text. |
| `src/tabs.ts` | `Tab` model + `TabBar` (renders the strip, fires `onActivate` / `onCloseRequest` / `onStructureChange`). |
| `src/miku-cream.ts` | Installs Crepe's structural frame CSS; `styles.css` owns the single built-in Miku Cream document rendering. |
| `src/link-clipboard.ts` | ProseMirror `$prose` plugin: paste a URL over a selection / `Ctrl+K` → link it. |
| `src/block-menu.ts` | The `⠿` block menu (turn‑into, insert table / image / divider / blank line, duplicate, delete). Raw ProseMirror commands. Exports `runBlockAction(crepe, id)` — the turn‑into entries reachable by `Ctrl/Cmd+0`–`7` from `main.ts`, built from the live selection via `targetFromSelection`. |
| `src/emoji.ts` | `:shortcode:` input rule (`$prose`, same class as `find.ts`) + `EmojiPicker` popup (`#emoji-picker`, `Ctrl/Cmd+.`), backend‑agnostic like `find-bar.ts`. |
| `src/emoji-data.ts` | Hand‑curated ~230 common emoji (glyph + shortcode + keywords) and alias map. Native Unicode only, no dependency. |
| `src/i18n.ts` | Tiny in‑app i18n. `DICT` (en + de), `t(key, vars)`, `setLang`/`onLangChange`, `applyStaticI18n()` (walks `data-i18n*` attrs). Leaf module — no app imports. Covers Mowl's chrome + the editor placeholder; Crepe's own micro‑UI stays English. |
| `src/settings-panel.ts` | The settings GUI (`#settings-panel`, `Ctrl/Cmd+,` or the gear button). Full‑screen overlay that flips in over the editor; one control per hand‑editable `settings.toml` key. "Dumb" — reports each change via `onChange`; `main.ts` owns the object, the apply‑functions and the debounced save. |
| `src/markdown-serializer.ts` | `remarkStringifyOptionsCtx` tweaks: bullet‑list marker (`*`/`-`/`+`) and link/image handlers that stop `&` in URLs being escaped. Applied in `Editor.init` via `crepe.editor.config`. |
| `src/find.ts` | `$prose` plugin for WYSIWYG find: scans text nodes for the query, decorates matches, exposes state via `findKey`. |
| `src/find-bar.ts` | The find / replace bar UI (`#find-bar`). Backend‑agnostic — `main.ts` hands it a `FindTarget` for the editor or the source textarea. |
| `src/styles.css` | App shell + toolbar + tab strip + source textarea + block menu + emoji picker + the Miku Cream rendering for headings, code, math, tables, quotes, lists and images. |
| `src-tauri/src/lib.rs` | Tauri builder: plugins (single‑instance first), `AppState`, command registry, `.setup()` spawns the `settings.toml` watcher. `file_arg()` picks a Markdown path out of argv. |
| `src-tauri/src/commands.rs` | All `#[tauri::command]`s: `get_settings`, `save_settings`, `read_document`, `write_document`, `render_html`, `read_image_data_url` (+ a local base64 encoder — no crate). `get_settings`'s payload also carries `version` (`CARGO_PKG_VERSION`) for the About panel. |
| `src-tauri/src/settings.rs` | `settings.toml` — **the one settings file**: hand‑editable prefs (language, direction, spellcheck, fonts, accent, shortcuts, quit_on_escape, list_marker, show_path, open_last_session, always_show_tabbar) + app‑managed state (window, open tabs). Plus the 1 Hz file watcher + write‑signature tracking. |
| `src-tauri/src/portable.rs` | Resolves the portable data dir (next to exe; on macOS next to the `.app`); writability check + OS‑config fallback. |
| `src-tauri/src/export.rs` | `render_html`: Markdown → GFM HTML (comrak) wrapped in a self‑contained page. |
| `src-tauri/src/mdfmt.rs` | `format_tables`: pretty‑prints GFM tables in a Markdown string. |
| `src-tauri/assets/export/` | Bundled (offline) KaTeX + highlight.js + Miku Cream export CSS/template, `include_str!`‑ed by `export.rs`. |
| `src-tauri/tauri.conf.json` | Window config, bundle config, CSP. |
| `src-tauri/capabilities/default.json` | Tauri permission allow‑list. **Add a permission here whenever you call a new `window.*` / plugin API.** |
| `.github/workflows/release.yml` | CI: 5‑target matrix (win x64/arm64, mac universal, linux x64/arm64), `tauri-action`, draft release + checksums. |
| `scripts/gen-settings-example.mjs` | Writes a fully‑commented `settings.example.toml` next to the built exe. Runs from `build.beforeBuildCommand` (every `tauri dev` / `tauri build`). Keep its key list in sync with `Settings`. |

---

## 3. Runtime files (created next to the executable)

Portable install → beside `Mowl.exe` (dev: `src-tauri/target/debug/`). If that
folder is read‑only, they fall back to the OS config dir and the app shows a
hint bar.

- **`settings.toml`** — the only settings file. Top half is hand‑editable
  (language, direction, spellcheck, fonts, sizes, accent, shortcuts, `quit_on_escape`,
  `list_marker`, `show_path`, `open_last_session`); bottom
  half is app‑managed (window geometry, open tabs). The app writes it
  debounced (800 ms) and on quit; a 1 Hz watcher (`settings::watch`) picks up
  **external** edits and emits `settings-changed` → `main.ts` re‑applies
  direction / appearance without a restart. The watcher skips the app's own
  writes by comparing a size+mtime signature (`AppState.last_write`).
  Text editing does **not** trigger a settings write.
- **`data/webview2/`** (Windows, portable only) — WebView2 cache, redirected here
  so nothing leaks into `%LOCALAPPDATA%`.

---

## 4. Core data flow

### Document / tabs
- One Crepe instance for the whole app. Tabs are cheap records
  `{ path, saved, content, dirty, scrollTop }`.
- Switching tabs → `TabBar.onActivate` → save the outgoing tab's text/scroll,
  then `writeView(next.content)` swaps the editor content in place
  (`replaceAll`, no teardown).
- `readView()` / `writeView()` abstract "WYSIWYG editor **or** source textarea".
- `toggleSource()` carries the reading position across the switch: it records the
  outgoing view's scroll as a 0..1 fraction (`viewScrollFraction()`) and re-applies
  it to the incoming view (`applyScrollFraction()`). Proportional only — cheap
  (runs once per toggle), drifts where rendered height ≠ source length.
  `applyScrollFraction()` must run **after** the view's `.focus()` — focusing the
  source textarea scrolls its caret (end of the just-set `.value`) into view and
  would otherwise clobber the restored position.
- `switching` flag suppresses the change handler during programmatic swaps.
- `adoptNormalized()` — Crepe reformats Markdown on load; we adopt that as the
  clean baseline so a freshly opened file isn't marked dirty.

### Save
`saveDoc` → `invoke("write_document", …)`. Rust pretty‑prints GFM tables
(`mdfmt`) and **returns the text it actually wrote**; the frontend resyncs the
view if it changed.

### Settings
`get_settings` returns `{ settings, portable, location, open_with }` in one call.
`save_settings` persists the whole `Settings` struct and records its signature.
External edits arrive as a `settings-changed` event.

### Opening files from the OS
`file_arg(argv)` finds the first existing `.md/.markdown/.mdx/.txt` in the
command line. First launch → `get_settings().open_with`. Later launches are
caught by `tauri-plugin-single-instance`, which emits `open-file` to the running
window and focuses it. `bundle.fileAssociations` in `tauri.conf.json` makes the
NSIS installer register `.md` / `.markdown`. macOS would need `RunEvent::Opened`
instead of argv (not wired yet).

### Images in the editor
The WebView can't load `<img>` by filesystem path. Crepe's image‑block feature
takes a `proxyDomURL(src)` hook (set in `Editor.init` via `featureConfigs`), which
`Editor.resolveImageSrc` implements: remote / `data:` / `blob:` / `#…` targets
pass straight through; anything else is sent to the `read_image_data_url` Rust
command, which resolves it against the active document's folder (`Editor.docPath`,
kept current by `main.ts` on tab activate / open / save‑as), reads the file, and
returns a `data:` URL (≤ 24 MiB). Results are memo‑cached per `docPath + src`.
The `⠿` menu's **Image** entry just inserts an empty `image-block` node — Crepe
renders its paste‑link / upload placeholder.

### Export
`render_html(markdown, title, dir)` → comrak GFM → `template.html` with all
CSS/JS/fonts inlined (KaTeX renders `$…$` on load, highlight.js colours code).
Frontend writes it via `write_document` (HTML path ⇒ table formatter skipped) or,
for PDF, loads it into a hidden `<iframe>` and calls `print()`.

---

## 5. How to add things

### A toolbar button
1. `index.html` → add `<button id="btn-x">` with an inline SVG inside `#actions`.
2. `src/main.ts` → `wireButtons()` → `getElementById("btn-x")?.addEventListener("click", …)`.
3. Style is already generic (`#actions button`). Use `.active` / `disabled` as needed.

### The About panel
`#btn-about` (the M↓ mark left of the doc title) → `#about` modal in `index.html`,
wired in `wireAbout()`. Version + settings path come from the `get_settings`
payload (`payload.version`, `payload.location`); the GitHub link opens externally
via `openUrl` (`@tauri-apps/plugin-opener`, covered by `opener:default`). Esc is
handled in `wireShortcuts()` ahead of find-bar / quit-on-escape.

### A block‑menu (⠿) entry
`src/block-menu.ts` → add an item to the right group in `GROUPS`. Give it an
`id: BlockActionId` to also expose it as a `Ctrl/Cmd+N` shortcut (wire the key in
`main.ts` `wireShortcuts()` → `editor.runBlockAction(id)`).
- Selection‑based conversion → `turnInto(v => someProseMirrorCommand)`
  (it lifts list items out first).
- Structural edit → `structural((view, target) => { …view.dispatch(tr)… })`
  where `target` is `{ textPos, from, to, node }` for the hovered block.
- Do **not** use Milkdown's command registry (`callCommand`) from here — it
  silently no‑ops across the Vite dep boundary. Use `@milkdown/kit/prose/*`.
- `resolveTarget()` handles **atom top‑level blocks** (images) specially:
  `posAtCoords` can only return a position *inside* text content, never
  "inside" an atom, so hovering one always yields a depth‑0 (doc‑level)
  boundary position — read `$pos.nodeAfter`/`nodeBefore` for that case
  instead of `$pos.node(1)`.

### A setting in `settings.toml`
1. `src-tauri/src/settings.rs` → add field to `Settings` + `Default` (the struct
   has `#[serde(default)]`, so old files stay compatible).
2. `src/main.ts` → add it to the `Settings` interface.
3. `scripts/gen-settings-example.mjs` → add the key (with a comment) so the
   shipped `settings.example.toml` documents it. Update README's config block too.
   - **Appearance pref** (font/colour): apply it in `applyAppearance()` as a CSS
     var, and add it to the `settings-changed` merge list so external edits take
     effect live.
   - **Behaviour pref** (like `quit_on_escape`): read `settings.x` where needed;
     add it to the `settings-changed` merge too.
   - **App‑managed value**: call `persistSoon()` after you change it. Do *not*
     persist on every keystroke.
4. For a hand‑editable pref, also add a control in `src/settings-panel.ts`
   (`SECTIONS` → the right `<fieldset>`) and a `case` in `main.ts`'s
   `settingsPanel.onChange` handler that runs the same apply‑function.

### A translatable string
1. Add the key to `EN` (and its German text to `DE`) in `src/i18n.ts`.
2. Static markup in `index.html`: `data-i18n` / `data-i18n-title` /
   `data-i18n-aria` — picked up by `applyStaticI18n()` on boot and on every
   language change.
3. JS‑built DOM (find bar, emoji picker, block menu, settings panel, tab bar):
   call `t(key)` when building and expose a `retranslate()` the central
   `onLangChange` handler in `main.ts` calls.

### A new Rust command
1. Write `#[tauri::command] pub fn foo(...) -> Result<T, String>` in `commands.rs`.
2. Register it in `lib.rs` → `tauri::generate_handler![…, commands::foo]`.
3. Call `invoke<T>("foo", { args })` from the frontend.
4. If it uses a `window.*` or plugin API on the JS side, add the matching
   permission to `capabilities/default.json`.

### A new export asset
Drop the file in `src-tauri/assets/export/`, `include_str!` it in `export.rs`,
add a `{{PLACEHOLDER}}` to `template.html`, and `.replace()` it in `render_html`.
Keep everything inlined so exports stay offline.

---

## 6. Decisions & constraints (don't re‑discover these the hard way)

- **Unsigned builds.** No Apple Developer account / Windows cert. Users get
  SmartScreen / Gatekeeper warnings on first launch; documented in the README.
  CI publishes SHA‑256 checksums.
- **`dragDropEnabled: false`** in `tauri.conf.json`. Needed so Crepe's HTML5
  table row/column drag works on WebView2. Trade‑off: dropping a file onto the
  window no longer opens it — use `Ctrl+O` or the OS file association.
- **File open = argv, not drag.** Double‑click / "Open with" launches
  `Mowl.exe <path>`. `tauri-plugin-single-instance` keeps it to one process and
  routes later opens into the running window. Association is registered by the
  **installer**, so the portable `.exe` alone won't show up as a default app.
- **`quit_on_escape`** (off by default). The block menu's Esc handler calls
  `stopImmediatePropagation()` so dismissing it never quits; other Crepe popups
  aren't guarded — revisit if it bites.
- **Minimized‑window position.** Windows reports ~`-32000` for a minimized
  window; `main.ts` filters bogus positions in `onMoved` and validates saved
  coordinates in `restoreWindow` (which also runs early + `setFocus`).
- **Milkdown command registry** is not reachable from our own modules (Vite
  pre‑bundles Crepe and our imports separately). Block menu uses raw ProseMirror
  commands from `@milkdown/kit/prose/*`. Marks/schema *are* shared, so
  `linkSchema.type(ctx)` etc. work.
- **Source view shows Crepe‑normalised Markdown**, not the original file bytes,
  because that normalised form is the baseline for the dirty check and is what
  gets written on save.
- **CSP is `null`** (`tauri.conf.json`). Fine for a local editor; tighten if the
  app ever loads remote content.
- **Big JS bundle (~1.5 MB).** Mostly CodeMirror language grammars pulled in by
  Crepe's code‑block feature, lazy‑loaded per language. Trim via Crepe's
  `featureConfigs` if it matters.
- **Repo lives under a pCloud sync path.** `target/` and `node_modules/` should
  be excluded from sync (or move the working copy out); only the git repo needs
  backing up.

---

## 7. Build / dev / release

```bash
pnpm install
pnpm tauri dev            # run with HMR (frontend) + auto-rebuild (Rust)
pnpm tauri build          # release bundles for the host OS
pnpm tauri build --bundles nsis      # Windows: just the installer (+ portable exe at target/release/mowl.exe)
cargo test --manifest-path src-tauri/Cargo.toml      # Rust unit tests
pnpm exec tsc --noEmit    # frontend typecheck
```

Toolchain: Rust stable (MSVC on Windows) + VS Build Tools + Windows SDK; Node 20+;
`pnpm`. WebView2 ships with Windows 10/11. See
<https://tauri.app/start/prerequisites/>.

**Release via CI:** push a `v*` tag → `.github/workflows/release.yml` builds all
five targets and opens a draft GitHub release. Bump `version` in **both**
`package.json` and `src-tauri/tauri.conf.json` first.

`pnpm` note: build scripts (esbuild) are gated — `pnpm-workspace.yaml` has the
`allowBuilds` / `onlyBuiltDependencies` entries that permit it.
