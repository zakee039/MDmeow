import { invoke } from "@tauri-apps/api/core";
import {
  availableMonitors,
  getCurrentWindow,
  LogicalSize,
  PhysicalPosition,
  primaryMonitor,
} from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { open, save, ask, message } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";

import { Editor } from "./editor";
import { CodeEditor } from "./code-editor";
import { TabBar, baseName, type Tab } from "./tabs";
import { isMarkdownPath, knownExtensions } from "./file-types";
import { installMikuCreamRendering } from "./miku-cream";
import { FindBar, type FindTarget } from "./find-bar";
import { EmojiPicker } from "./emoji";
import { SettingsPanel, type SettingKey } from "./settings-panel";
import { isListMarker, type ListMarker } from "./markdown-serializer";
import type { BlockActionId } from "./block-menu";
import {
  formatShortcut,
  matchesShortcut,
  withDefaultShortcuts,
  type ShortcutSettings,
} from "./shortcuts";
import {
  t,
  setLang,
  onLangChange,
  applyStaticI18n,
  type LangPref,
} from "./i18n";

interface WindowState {
  width: number;
  height: number;
  x: number | null;
  y: number | null;
  maximized: boolean;
  geometry_version: number;
}

const DEFAULT_WINDOW_WIDTH = 640;
const DEFAULT_WINDOW_HEIGHT = 680;

interface Settings {
  /** UI language: "system" (OS locale) | "en" | "de" | "ja" | "zh-CN". */
  language: LangPref;
  spellcheck: boolean;
  quit_on_escape: boolean;
  /** Bullet-list marker written on save: "*", "-" or "+". */
  list_marker: ListMarker;
  /** Show the full file path (not just the name) in the editor header. */
  show_path: boolean;
  /** Reopen the previous session's tabs on startup. */
  open_last_session: boolean;
  /** Keep the tab bar visible even when only one file is open. */
  always_show_tabbar: boolean;
  editor_font: string;
  editor_font_size: number;
  source_font: string;
  source_font_size: number;
  code_alternate_rows: boolean;
  code_alternate_row_color: string;
  remember_window_position: boolean;
  file_associations: string[];
  accent: string;
  proxy_enabled: boolean;
  proxy_url: string;
  auto_check_updates: boolean;
  shortcuts: ShortcutSettings;
  open_with_prompt_dismissed: boolean;
  last_update_check: number;
  open_files: string[];
  active_tab: number;
  window: WindowState;
}

interface SettingsPayload {
  settings: Settings;
  portable: boolean;
  fallback: boolean;
  location: string;
  open_with: string | null;
  version: string;
}

interface OpenWithStatus {
  available: boolean;
  registered: boolean;
  managed_by_msi: boolean;
  can_modify: boolean;
  registered_extensions: string[];
}

interface VersionInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  mode: "portable" | "installed" | "unsupported";
  releaseUrl: string;
  notes: string;
  publishedAt: string | null;
  canDownload: boolean;
  assetName: string | null;
  assetSize: number | null;
}

interface PreparedVersion {
  version: string;
  mode: "portable" | "installed";
  path: string;
  alreadyDownloaded: boolean;
}

interface VersionTransferProgress {
  downloaded: number;
  total: number;
}

const win = getCurrentWindow();
const editorHost = document.getElementById("editor") as HTMLElement;
const sourceShell = document.getElementById("source-shell") as HTMLElement;
const sourceEl = document.getElementById("source") as HTMLElement;
const titleEl = document.getElementById("doc-title") as HTMLElement;
const titleInput = document.getElementById("doc-title-input") as HTMLInputElement;
const editor = new Editor(editorHost);
const codeEditor = new CodeEditor(sourceEl);
const tabBar = new TabBar(document.getElementById("tabs") as HTMLElement);
const findBar = new FindBar(editorHost);
const emojiPicker = new EmojiPicker();
const settingsPanel = new SettingsPanel(() => settings);

let settings: Settings;
let openWithStatus: OpenWithStatus = {
  available: false,
  registered: false,
  managed_by_msi: false,
  can_modify: false,
  registered_extensions: [],
};
let switching = false;
/** User-selected Markdown source view. Non-Markdown tabs always use Code mode. */
let sourceMode = false;
/** The view that is currently mounted/visible. Kept separate from active tab
 *  so tab switches can first snapshot the previous tab correctly. */
let codeViewVisible = false;
let persistTimer: number | undefined;

function shouldUseCodeView(tab: Tab | undefined = tabBar.active): boolean {
  return sourceMode || Boolean(tab && !isMarkdownPath(tab.path));
}

function setViewVisibility(tab: Tab | undefined = tabBar.active): void {
  codeViewVisible = shouldUseCodeView(tab);
  editorHost.hidden = codeViewVisible;
  sourceShell.hidden = !codeViewVisible;
}

/** Current document text, from whichever view is active. */
function readView(): string {
  return codeViewVisible ? codeEditor.getText() : editor.getMarkdown();
}

/** Load `md` into the active view (and restore a scroll offset). */
function writeView(md: string, scrollTop = 0): void {
  if (codeViewVisible) {
    void codeEditor.setDocument(md, tabBar.active?.path ?? null, scrollTop);
    return;
  }
  switching = true;
  editor.setContent(md);
  requestAnimationFrame(() => {
    editorHost.scrollTop = scrollTop;
    switching = false;
  });
}

function viewScrollTop(): number {
  return codeViewVisible ? codeEditor.scrollTop : editorHost.scrollTop;
}

/** How far the visible view is scrolled, as a 0..1 fraction of its range.
 *  Used to carry the reading position across a source/preview toggle. */
function viewScrollFraction(): number {
  const range = codeViewVisible
    ? codeEditor.scrollHeight - codeEditor.clientHeight
    : editorHost.scrollHeight - editorHost.clientHeight;
  if (range <= 0) return 0;
  const scrollTop = codeViewVisible ? codeEditor.scrollTop : editorHost.scrollTop;
  return Math.min(1, Math.max(0, scrollTop / range));
}

/** Scroll the visible view to `frac` (0..1) of its range. The editor's height
 *  only settles after layout, so defer a frame there; the textarea is ready
 *  synchronously but must be set after `.focus()` (which scrolls its caret). */
function applyScrollFraction(frac: number): void {
  const run = () => {
    if (codeViewVisible) {
      const range = codeEditor.scrollHeight - codeEditor.clientHeight;
      codeEditor.scrollTop = range > 0 ? Math.round(frac * range) : 0;
    } else {
      const range = editorHost.scrollHeight - editorHost.clientHeight;
      editorHost.scrollTop = range > 0 ? Math.round(frac * range) : 0;
    }
  };
  requestAnimationFrame(run);
}

/** Push the appearance-related settings into CSS custom properties. */
function applyAppearance(): void {
  const s = document.documentElement.style;
  const setOrClear = (name: string, value: string) => {
    const v = (value ?? "").trim();
    if (v) s.setProperty(name, v);
    else s.removeProperty(name);
  };
  s.setProperty("--editor-font-size", `${settings.editor_font_size || 16}px`);
  s.setProperty("--source-font-size", `${settings.source_font_size || 15}px`);
  setOrClear("--editor-font", settings.editor_font);
  setOrClear("--source-font", settings.source_font);
  setOrClear("--accent", settings.accent);
  setOrClear("--code-alt-row-color", settings.code_alternate_row_color || "#FAFFFF");
}

/** Switch the UI language and refresh every visible string. */
function applyLanguage(pref: LangPref): void {
  setLang(pref); // fires the onLangChange handler below (no-op if unchanged)
}

// One place to re-render every translatable surface after a language change.
onLangChange(() => {
  applyStaticI18n();
  editor.retranslate();
  findBar.retranslate();
  emojiPicker.retranslate();
  settingsPanel.retranslate();
  tabBar.render();
  updateSourceButton();
  updateShortcutTitles();
  updateTitle();
  renderVersionInfo();
});

function stem(path: string | null): string {
  return baseName(path).replace(/\.[^.]+$/, "") || "document";
}

function updateTitle(): void {
  const tab = tabBar.active;
  const mark = tab?.dirty ? "• " : "";
  const name = baseName(tab?.path ?? null);
  const shown = settings?.show_path && tab?.path ? tab.path : name;
  titleEl.textContent = mark + shown;
  titleEl.title = tab?.path ?? "";
  void win.setTitle(`${mark}${name} — MDmeow`);
}

function cancelTitleRename(): void {
  titleInput.hidden = true;
  titleEl.hidden = false;
  updateTitle();
}

async function commitTitleRename(): Promise<void> {
  const tab = tabBar.active;
  if (!tab?.path) {
    cancelTitleRename();
    return;
  }
  const currentName = baseName(tab.path);
  const newName = titleInput.value.trim();
  if (!newName || newName === currentName) {
    cancelTitleRename();
    return;
  }
  try {
    const content = readView();
    const scrollTop = viewScrollTop();
    const wasCodeView = codeViewVisible;
    const nextPath = await invoke<string>("rename_document", {
      path: tab.path,
      newName,
    });
    tab.path = nextPath;
    editor.setDocPath(nextPath);
    setViewVisibility(tab);
    if (wasCodeView !== codeViewVisible) {
      if (codeViewVisible) {
        await codeEditor.setDocument(content, nextPath, scrollTop);
      } else {
        writeView(content, scrollTop);
      }
    } else if (codeViewVisible) {
      void codeEditor.setLanguageForPath(nextPath);
    }
    tabBar.render();
    updateSourceButton();
    persistSoon();
  } catch (err) {
    await message(t("dialog.renameError", { err: String(err) }), {
      title: "MDmeow",
      kind: "error",
    });
  } finally {
    cancelTitleRename();
  }
}

function beginTitleRename(): void {
  const tab = tabBar.active;
  if (!tab) return;
  if (!tab.path) {
    void saveAs();
    return;
  }
  const name = baseName(tab.path);
  titleInput.value = name;
  titleEl.hidden = true;
  titleInput.hidden = false;
  titleInput.focus();
  const dot = name.lastIndexOf(".");
  titleInput.setSelectionRange(0, dot > 0 ? dot : name.length);
}

function persistSoon(): void {
  const withPath = tabBar.tabs.filter((t) => t.path);
  settings.open_files = withPath.map((t) => t.path as string);
  const activePath = tabBar.active?.path ?? null;
  const idx = activePath ? settings.open_files.indexOf(activePath) : -1;
  settings.active_tab = idx < 0 ? 0 : idx;

  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    void invoke("save_settings", { settings });
  }, 800);
}

async function refreshOpenWithStatus(): Promise<OpenWithStatus> {
  openWithStatus = await invoke<OpenWithStatus>("get_open_with_status");
  settingsPanel.setOpenWithStatus(
    openWithStatus.available,
    openWithStatus.registered,
    openWithStatus.managed_by_msi,
    openWithStatus.can_modify,
  );
  settingsPanel.setAssociationStatus(
    openWithStatus.available,
    openWithStatus.registered_extensions,
  );
  return openWithStatus;
}

async function registerFileAssociations(extensions: string[]): Promise<void> {
  try {
    openWithStatus = await invoke<OpenWithStatus>("register_file_associations", {
      extensions,
    });
    settingsPanel.setOpenWithStatus(
      openWithStatus.available,
      openWithStatus.registered,
      openWithStatus.managed_by_msi,
      openWithStatus.can_modify,
    );
    settingsPanel.setAssociationStatus(
      openWithStatus.available,
      openWithStatus.registered_extensions,
    );
  } catch (err) {
    await message(t("dialog.openWithError", { err: String(err) }), {
      title: "MDmeow",
      kind: "error",
    });
    throw err;
  }
}

async function setOpenWithRegistration(register: boolean): Promise<void> {
  try {
    openWithStatus = await invoke<OpenWithStatus>(
      register ? "register_open_with" : "unregister_open_with",
    );
    settingsPanel.setOpenWithStatus(
      openWithStatus.available,
      openWithStatus.registered,
      openWithStatus.managed_by_msi,
      openWithStatus.can_modify,
    );
    settingsPanel.setAssociationStatus(
      openWithStatus.available,
      openWithStatus.registered_extensions,
    );
    settings.open_with_prompt_dismissed = register ? false : true;
    persistSoon();
  } catch (err) {
    await message(t("dialog.openWithError", { err: String(err) }), {
      title: "MDmeow",
      kind: "error",
    });
  }
}

async function initializeOpenWithIntegration(): Promise<void> {
  const status = await refreshOpenWithStatus();
  if (
    !status.available ||
    status.registered ||
    !status.can_modify ||
    settings.open_with_prompt_dismissed
  ) {
    return;
  }

  const register = await ask(t("dialog.openWithPrompt"), {
    title: "MDmeow",
    kind: "info",
  });
  if (register) {
    await setOpenWithRegistration(true);
  } else {
    settings.open_with_prompt_dismissed = true;
    persistSoon();
  }
}

/** Crepe may reformat Markdown on load; adopt that as the tab's baseline so a
 *  freshly loaded document does not show up as dirty. */
function adoptNormalized(tab: Tab): void {
  if (codeViewVisible) return; // Code mode keeps source text verbatim
  const md = editor.getMarkdown();
  tab.content = md;
  if (!tab.dirty) tab.saved = md;
}

function markDirtyFromView(): void {
  const tab = tabBar.active;
  if (!tab) return;
  tab.content = readView();
  tab.dirty = tab.content !== tab.saved;
  tabBar.refreshDirty();
  updateTitle();
  // No persist here: editing text changes nothing in settings.toml.
}

async function fileReadable(path: string): Promise<boolean> {
  try {
    await invoke<string>("read_document", { path });
    return true;
  } catch {
    return false;
  }
}

// --- tab wiring -------------------------------------------------------------

tabBar.onStructureChange = () => persistSoon();

tabBar.onActivate = (next: Tab, prev: Tab | null) => {
  if (prev) {
    prev.content = readView();
    prev.scrollTop = viewScrollTop();
  }
  editor.setDocPath(next.path);
  setViewVisibility(next);
  writeView(next.content, next.scrollTop);
  adoptNormalized(next);
  editor.setSpellcheck(settings.spellcheck);
  codeEditor.setAlternateRows(settings.code_alternate_rows);
  updateTitle();
  updateSourceButton();
  (codeViewVisible ? codeEditor : editor).focus();
  persistSoon();
};

tabBar.onCloseRequest = async (tab: Tab) => {
  if (tab.dirty) {
    const discard = await ask(
      t("dialog.discardChanges", { name: baseName(tab.path) }),
      { title: "MDmeow", kind: "warning" },
    );
    if (!discard) return;
  }
  tabBar.remove(tab.id);
  persistSoon();
};

editor.onChange = () => {
  if (switching || codeViewVisible) return;
  markDirtyFromView();
};

codeEditor.onChange = () => {
  if (!codeViewVisible) return;
  markDirtyFromView();
};

emojiPicker.onPick = (glyph) => {
  if (codeViewVisible) {
    codeEditor.insertText(glyph);
  } else {
    editor.insertText(glyph);
    markDirtyFromView();
  }
};
emojiPicker.onClose = () => (codeViewVisible ? codeEditor : editor).focus();

function applyProxySettings(reloadEditor: boolean): void {
  editor.setProxyConfig(settings.proxy_enabled, settings.proxy_url);
  if (!reloadEditor || codeViewVisible) return;
  switching = true;
  void editor.reload().then(() => {
    editor.setSpellcheck(settings.spellcheck);
    switching = false;
    markDirtyFromView();
  });
}

// The settings GUI reports each change here; we own the object + the save.
settingsPanel.onChange = (key: SettingKey, value) => {
  (settings as unknown as Record<string, unknown>)[key] = value;
  switch (key) {
    case "language":
      applyLanguage(value as LangPref);
      break;
    case "spellcheck":
      editor.setSpellcheck(settings.spellcheck);
      break;
    case "show_path":
      updateTitle();
      break;
    case "always_show_tabbar":
      tabBar.setAlwaysShow(settings.always_show_tabbar);
      break;
    case "list_marker":
      if (isListMarker(settings.list_marker)) {
        editor.setListMarker(settings.list_marker);
        if (!codeViewVisible) {
          switching = true;
          void editor.reload().then(() => {
            editor.setSpellcheck(settings.spellcheck);
            switching = false;
            markDirtyFromView();
          });
        }
      }
      break;
    case "editor_font":
    case "editor_font_size":
    case "source_font":
    case "source_font_size":
    case "accent":
    case "code_alternate_row_color":
      applyAppearance();
      break;
    case "code_alternate_rows":
      codeEditor.setAlternateRows(settings.code_alternate_rows);
      break;
    case "proxy_enabled":
    case "proxy_url":
      applyProxySettings(true);
      break;
    // quit_on_escape / open_last_session: no immediate effect
  }
  persistSoon();
};
settingsPanel.onShortcutChange = (action, value) => {
  settings.shortcuts[action] = value;
  updateShortcutTitles();
  settingsPanel.refresh();
  persistSoon();
};
settingsPanel.onOpenWithToggle = async () => {
  if (!openWithStatus.can_modify) return;
  await setOpenWithRegistration(!openWithStatus.registered);
};
settingsPanel.onRegisterAssociations = async (extensions) => {
  settings.file_associations = [...extensions];
  persistSoon();
  await registerFileAssociations(extensions);
};
settingsPanel.onSetDefaultAssociations = async (extensions) => {
  settings.file_associations = [...extensions];
  persistSoon();
  await registerFileAssociations(extensions);
  await openUrl("ms-settings:defaultapps?registeredAppUser=MDmeow");
};
settingsPanel.onCheckUpdates = async () => {
  await checkVersion(false);
  if (!versionInfo) return t("update.failed", { err: "" }).trim();
  return versionInfo.updateAvailable
    ? t("update.available", { version: versionInfo.latestVersion })
    : t("update.latest");
};
settingsPanel.onProxyTest = async (proxyUrl) => {
  await invoke("test_proxy", { proxyUrl });
};
settingsPanel.onClose = () => (codeViewVisible ? codeEditor : editor).focus();

// --- file operations -------------------------------------------------------

function newTab(): void {
  tabBar.add(null, "");
}

async function openPath(path: string): Promise<void> {
  const existing = tabBar.findByPath(path);
  if (existing) {
    tabBar.activate(existing.id);
    return;
  }

  let text: string;
  try {
    text = await invoke<string>("read_document", { path });
  } catch (e) {
    await message(String(e), { title: "MDmeow", kind: "error" });
    return;
  }

  const cur = tabBar.active;
  if (cur && !cur.path && !cur.dirty && cur.content === "") {
    cur.path = path;
    cur.saved = text;
    cur.content = text;
    cur.dirty = false;
    editor.setDocPath(path);
    setViewVisibility(cur);
    writeView(text);
    adoptNormalized(cur);
    tabBar.render();
    editor.setSpellcheck(settings.spellcheck);
    updateSourceButton();
    (codeViewVisible ? codeEditor : editor).focus();
    updateTitle();
  } else {
    tabBar.add(path, text); // triggers onActivate -> editor.setContent
  }

  persistSoon();
}

async function openDialog(): Promise<void> {
  const picked = await open({
    multiple: false,
    directory: false,
    filters: [
      { name: "Documents / Code", extensions: knownExtensions() },
      { name: "All files", extensions: ["*"] },
    ],
  });
  if (typeof picked === "string") await openPath(picked);
}

async function wireFileDrop(): Promise<void> {
  await win.onDragDropEvent((event) => {
    const payload = event.payload;
    if (payload.type === "enter" || payload.type === "over") {
      document.body.classList.add("mdmeow-file-drag");
      return;
    }

    document.body.classList.remove("mdmeow-file-drag");
    if (payload.type !== "drop") return;

    const paths = payload.paths;
    if (paths.length === 0) return;
    void (async () => {
      for (const path of paths) await openPath(path);
      try {
        await win.unminimize();
        await win.setFocus();
      } catch {
        /* not critical */
      }
    })();
  });
}

async function saveDoc(): Promise<boolean> {
  const tab = tabBar.active;
  if (!tab) return false;
  if (!tab.path) return saveAs();

  const md = readView();
  let written: string;
  try {
    // The backend beautifies GFM tables and returns the text it wrote.
    written = await invoke<string>("write_document", {
      path: tab.path,
      contents: md,
    });
  } catch (e) {
    await message(String(e), { title: "MDmeow", kind: "error" });
    return false;
  }
  if (codeViewVisible) {
    // Code mode shows raw text, so reflect backend formatting back when needed.
    if (written !== md) writeView(written, viewScrollTop());
    tab.saved = written;
    tab.content = written;
  } else {
    // Preview mode: re-loading the document into Crepe (`replaceAll`) would
    // wipe the undo history, and the backend's table beautification is
    // invisible in the rendered view anyway. Leave the editor untouched and
    // take its own serialization as the new clean baseline — the file on disk
    // holds `written`, which round-trips to the same rendered document.
    tab.saved = md;
    tab.content = md;
  }
  tab.dirty = false;
  tabBar.refreshDirty();
  updateTitle();
  persistSoon();
  return true;
}

async function saveAs(): Promise<boolean> {
  const tab = tabBar.active;
  if (!tab) return false;

  const dest = await save({
    defaultPath: tab.path ?? `${stem(tab.path)}.md`,
    filters: [{ name: "Documents / Code", extensions: knownExtensions() }],
  });
  if (!dest) return false;

  const content = readView();
  const scrollTop = viewScrollTop();
  const wasCodeView = codeViewVisible;
  tab.path = dest;
  editor.setDocPath(dest);
  setViewVisibility(tab);
  if (wasCodeView !== codeViewVisible) {
    if (codeViewVisible) {
      await codeEditor.setDocument(content, dest, scrollTop);
    } else {
      writeView(content, scrollTop);
    }
  } else if (codeViewVisible) {
    void codeEditor.setLanguageForPath(dest);
  }
  const ok = await saveDoc();
  if (ok) {
    tabBar.render();
    updateSourceButton();
    updateTitle();
    persistSoon();
  }
  return ok;
}

async function closeActiveTab(): Promise<void> {
  const tab = tabBar.active;
  if (tab) await tabBar.onCloseRequest(tab);
}

// --- export ---------------------------------------------------------------

async function exportHtml(): Promise<void> {
  const tab = tabBar.active;
  const dest = await save({
    defaultPath: `${stem(tab?.path ?? null)}.html`,
    filters: [{ name: "HTML", extensions: ["html"] }],
  });
  if (!dest) return;
  try {
    const html = await invoke<string>("render_html", {
      markdown: readView(),
      title: stem(tab?.path ?? null),
      docPath: tab?.path ?? null,
    });
    await invoke("write_document", { path: dest, contents: html });
    await message(t("dialog.htmlExported"), { title: "MDmeow" });
  } catch (e) {
    await message(String(e), { title: "MDmeow", kind: "error" });
  }
}

async function exportPdf(): Promise<void> {
  const tab = tabBar.active;
  const html = await invoke<string>("render_html", {
    markdown: readView(),
    title: stem(tab?.path ?? null),
    docPath: tab?.path ?? null,
  });
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  frame.srcdoc = html;
  frame.onload = () => {
    window.setTimeout(() => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(() => frame.remove(), 1500);
    }, 350);
  };
  document.body.appendChild(frame);
}

// --- source view --------------------------------------------------------

const ICON_TO_SOURCE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M16 18l6-6-6-6"/><path d="M8 6l-6 6 6 6"/></svg>';
const ICON_TO_WYSIWYG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';

function updateSourceButton(): void {
  const btn = document.getElementById("btn-source") as HTMLButtonElement | null;
  if (!btn) return;
  const markdown = isMarkdownPath(tabBar.active?.path ?? null);
  btn.disabled = !markdown;
  btn.innerHTML = markdown && sourceMode ? ICON_TO_WYSIWYG : ICON_TO_SOURCE;
  const label = markdown
    ? sourceMode
      ? t("toolbar.sourceBack.title")
      : t("toolbar.source.title")
    : t("toolbar.source.codeMode");
  const shortcut = settings?.shortcuts?.toggle_source;
  btn.setAttribute(
    "title",
    markdown && shortcut ? `${label} (${formatShortcut(shortcut)})` : label,
  );
}

function updateShortcutTitles(): void {
  if (!settings?.shortcuts) return;
  const openBtn = document.getElementById("btn-open");
  if (openBtn) {
    openBtn.title = `${t("menu.new")} / ${t("menu.open")} (${formatShortcut(
      settings.shortcuts.new_tab,
    )}, ${formatShortcut(settings.shortcuts.open)})`;
  }
  const saveBtn = document.getElementById("btn-save");
  if (saveBtn) {
    saveBtn.title = `${t("toolbar.save.aria")} (${formatShortcut(settings.shortcuts.save)})`;
  }
  const saveAsBtn = document.getElementById("btn-save-as");
  if (saveAsBtn) {
    saveAsBtn.title = `${t("toolbar.saveAs.aria")} (${formatShortcut(settings.shortcuts.save_as)})`;
  }
  const exportBtn = document.getElementById("btn-export");
  if (exportBtn) {
    exportBtn.title = `${t("toolbar.export.aria")} (${formatShortcut(settings.shortcuts.export)})`;
  }
  const settingsBtn = document.getElementById("btn-settings");
  if (settingsBtn) {
    settingsBtn.title = `${t("toolbar.settings.aria")} (${formatShortcut(
      settings.shortcuts.settings,
    )})`;
  }
  updateSourceButton();
}

function toggleSource(): void {
  const tab = tabBar.active;
  if (!tab || !isMarkdownPath(tab.path)) return;

  findBar.close();
  const md = readView();
  tab.content = md;
  const frac = viewScrollFraction(); // reading position in the outgoing view

  sourceMode = !sourceMode;
  setViewVisibility(tab);

  writeView(md);
  adoptNormalized(tab);
  tab.dirty = tab.content !== tab.saved;
  tabBar.refreshDirty();
  updateSourceButton();
  updateTitle();
  (codeViewVisible ? codeEditor : editor).focus();
  applyScrollFraction(frac);
}

// --- find / replace -----------------------------------------------------

const editorFindTarget: FindTarget = {
  selectionText: () => editor.selectionText(),
  setQuery: (q, cs) => editor.findSet(q, cs),
  step: (dir) => editor.findStep(dir),
  replace: (r) => editor.findReplace(r),
  replaceAll: (r) => editor.findReplaceAll(r),
  clear: () => editor.findClear(),
  focusView: () => editor.focus(),
};

const sourceFindTarget: FindTarget = {
  selectionText: () => codeEditor.selectionText(),
  setQuery: (q, cs) => codeEditor.findSet(q, cs),
  step: (dir) => codeEditor.findStep(dir),
  replace: (r) => codeEditor.findReplace(r),
  replaceAll: (r) => codeEditor.findReplaceAll(r),
  clear: () => codeEditor.findClear(),
  focusView: () => codeEditor.focus(),
};

function openFind(withReplace: boolean): void {
  findBar.bind(() => (codeViewVisible ? sourceFindTarget : editorFindTarget));
  findBar.open(withReplace);
}

// --- about panel --------------------------------------------------------

const aboutEl = document.getElementById("about") as HTMLElement;
const updateDot = document.getElementById("update-dot") as HTMLElement;
const updateCheckButton = document.getElementById(
  "about-check-update",
) as HTMLButtonElement;
const updateStatusEl = document.getElementById(
  "about-update-status",
) as HTMLElement;
const updateNotesEl = document.getElementById(
  "about-update-notes",
) as HTMLElement;
const updateProgressEl = document.getElementById(
  "about-update-progress",
) as HTMLElement;
const updateProgressBar = document.getElementById(
  "about-update-progress-bar",
) as HTMLElement;
const updateProgressText = document.getElementById(
  "about-update-progress-text",
) as HTMLElement;
const updateActionsEl = document.getElementById(
  "about-update-actions",
) as HTMLElement;
const updateSecondaryButton = document.getElementById(
  "about-update-secondary",
) as HTMLButtonElement;
const updatePrimaryButton = document.getElementById(
  "about-update-primary-action",
) as HTMLButtonElement;
const mikuEasterEl = document.getElementById("miku-easter") as HTMLElement;
const mikuEasterImage = document.getElementById(
  "miku-easter-image",
) as HTMLImageElement;
let aboutLogoClickCount = 0;
let aboutLogoClickTimer: number | null = null;
let versionInfo: VersionInfo | null = null;
let preparedVersion: PreparedVersion | null = null;
let versionBusy = false;
let updatePrimaryAction: (() => void | Promise<void>) | null = null;
let updateSecondaryAction: (() => void | Promise<void>) | null = null;

function openAbout(): void {
  findBar.close();
  renderVersionInfo();
  aboutEl.hidden = false;
}

function closeAbout(): void {
  aboutEl.hidden = true;
}

function openMikuEaster(): void {
  mikuEasterEl.hidden = false;
}

function closeMikuEaster(): void {
  mikuEasterEl.hidden = true;
}

function setUpdateActions(
  secondary: { label: string; action: (() => void | Promise<void>) | null } | null,
  primary: { label: string; action: (() => void | Promise<void>) | null } | null,
): void {
  updateSecondaryAction = secondary?.action ?? null;
  updatePrimaryAction = primary?.action ?? null;
  updateSecondaryButton.hidden = !secondary;
  updatePrimaryButton.hidden = !primary;
  if (secondary) updateSecondaryButton.textContent = secondary.label;
  if (primary) updatePrimaryButton.textContent = primary.label;
  updateActionsEl.hidden = !secondary && !primary;
}

function setUpdateProgress(downloaded = 0, total = 0): void {
  const ratio = total > 0 ? Math.min(1, downloaded / total) : 0;
  const percent = Math.round(ratio * 100);
  updateProgressEl.hidden = total <= 0;
  updateProgressBar.style.width = `${percent}%`;
  updateProgressText.textContent = `${percent}%`;
}

function renderVersionInfo(): void {
  updateCheckButton.disabled = versionBusy;
  updateCheckButton.textContent = versionBusy ? t("update.checking") : t("update.check");

  if (!versionInfo) {
    updateStatusEl.hidden = true;
    updateNotesEl.hidden = true;
    setUpdateActions(null, null);
    return;
  }

  if (preparedVersion) {
    updateDot.hidden = false;
    updateStatusEl.hidden = false;
    updateNotesEl.hidden = true;
    updateStatusEl.textContent =
      preparedVersion.mode === "portable"
        ? t("update.downloadedPortable", { version: preparedVersion.version })
        : t("update.downloadedInstalled", { version: preparedVersion.version });
    if (preparedVersion.mode === "portable") {
      setUpdateActions(
        {
          label: t("update.openFolder"),
          action: () =>
            invoke("show_prepared_version", { version: preparedVersion!.version }),
        },
        { label: t("update.openNew"), action: usePreparedVersion },
      );
    } else {
      setUpdateActions(
        {
          label: t("update.releasePage"),
          action: () => openUrl(versionInfo!.releaseUrl),
        },
        { label: t("update.install"), action: usePreparedVersion },
      );
    }
    return;
  }

  if (!versionInfo.updateAvailable) {
    updateDot.hidden = true;
    updateStatusEl.hidden = false;
    updateStatusEl.textContent = t("update.latest");
    updateNotesEl.hidden = true;
    setUpdateActions(null, null);
    return;
  }

  updateDot.hidden = false;
  updateStatusEl.hidden = false;
  updateStatusEl.textContent = t("update.available", {
    version: versionInfo.latestVersion,
  });
  updateNotesEl.textContent = versionInfo.notes.trim();
  updateNotesEl.hidden = !versionInfo.notes.trim();

  if (!versionInfo.canDownload || versionInfo.mode === "unsupported") {
    setUpdateActions(
      {
        label: t("update.releasePage"),
        action: () => openUrl(versionInfo!.releaseUrl),
      },
      null,
    );
    if (!versionInfo.canDownload) {
      updateStatusEl.textContent += ` ${t("update.assetPending")}`;
    }
    return;
  }

  setUpdateActions(
    {
      label: t("update.releasePage"),
      action: () => openUrl(versionInfo!.releaseUrl),
    },
    {
      label:
        versionInfo.mode === "portable"
          ? t("update.downloadPortable")
          : t("update.downloadInstalled"),
      action: prepareLatestVersion,
    },
  );
}

async function checkVersion(silent: boolean): Promise<void> {
  if (versionBusy) return;
  versionBusy = true;
  preparedVersion = null;
  setUpdateProgress();
  if (!silent) renderVersionInfo();
  settings.last_update_check = Math.floor(Date.now() / 1000);
  persistSoon();
  try {
    versionInfo = await invoke<VersionInfo>("check_for_update", {
      proxyEnabled: settings.proxy_enabled,
      proxyUrl: settings.proxy_url,
    });
    renderVersionInfo();
  } catch (err) {
    if (!silent) {
      versionInfo = null;
      updateStatusEl.hidden = false;
      updateStatusEl.textContent = t("update.failed", { err: String(err) });
      updateNotesEl.hidden = true;
      setUpdateActions(null, null);
    }
  } finally {
    versionBusy = false;
    if (!silent || versionInfo?.updateAvailable) renderVersionInfo();
  }
}

async function usePreparedVersion(): Promise<void> {
  if (!preparedVersion) return;
  if (tabBar.tabs.some((tab) => tab.dirty)) {
    const proceed = await ask(t("update.unsavedInstall"), {
      title: "MDmeow",
      kind: "warning",
    });
    if (!proceed) return;
  }

  await captureGeometry();
  await flushSettings();
  await invoke("use_prepared_version", { version: preparedVersion.version });
  await win.destroy();
}

async function prepareLatestVersion(): Promise<void> {
  if (!versionInfo?.updateAvailable || !versionInfo.canDownload || versionBusy) {
    return;
  }

  versionBusy = true;
  updateCheckButton.disabled = true;
  updateStatusEl.hidden = false;
  updateStatusEl.textContent = t("update.downloading");
  updateNotesEl.hidden = true;
  setUpdateActions(null, null);
  const initialTotal = versionInfo.assetSize ?? 0;
  setUpdateProgress(0, initialTotal);

  try {
    preparedVersion = await invoke<PreparedVersion>("prepare_new_version", {
      expectedVersion: versionInfo.latestVersion,
      proxyEnabled: settings.proxy_enabled,
      proxyUrl: settings.proxy_url,
    });
    setUpdateProgress();
    updateStatusEl.textContent =
      preparedVersion.mode === "portable"
        ? t("update.downloadedPortable", { version: preparedVersion.version })
        : t("update.downloadedInstalled", { version: preparedVersion.version });

    if (preparedVersion.mode === "portable") {
      setUpdateActions(
        {
          label: t("update.openFolder"),
          action: () =>
            invoke("show_prepared_version", { version: preparedVersion!.version }),
        },
        {
          label: t("update.openNew"),
          action: usePreparedVersion,
        },
      );
    } else {
      setUpdateActions(
        {
          label: t("update.releasePage"),
          action: () => openUrl(versionInfo!.releaseUrl),
        },
        {
          label: t("update.install"),
          action: usePreparedVersion,
        },
      );
    }
  } catch (err) {
    preparedVersion = null;
    setUpdateProgress();
    updateStatusEl.textContent = t("update.failed", { err: String(err) });
    updateNotesEl.hidden = true;
    setUpdateActions(
      versionInfo
        ? {
            label: t("update.releasePage"),
            action: () => openUrl(versionInfo!.releaseUrl),
          }
        : null,
      null,
    );
  } finally {
    versionBusy = false;
    updateCheckButton.disabled = false;
    updateCheckButton.textContent = t("update.check");
  }
}

function maybeCheckVersionInBackground(): void {
  if (!settings.auto_check_updates) return;
  const now = Math.floor(Date.now() / 1000);
  const last = Number(settings.last_update_check) || 0;
  if (now - last < 24 * 60 * 60) return;
  void checkVersion(true);
}

function wireAbout(): void {
  document.getElementById("btn-about")?.addEventListener("click", openAbout);
  updateCheckButton.addEventListener("click", () => void checkVersion(false));
  updatePrimaryButton.addEventListener("click", () => {
    if (updatePrimaryAction) void updatePrimaryAction();
  });
  updateSecondaryButton.addEventListener("click", () => {
    if (updateSecondaryAction) void updateSecondaryAction();
  });
  aboutEl.querySelector(".about-close")?.addEventListener("click", closeAbout);
  aboutEl.addEventListener("click", (e) => {
    if (e.target === aboutEl) closeAbout(); // click on the backdrop
  });
  document.getElementById("about-link")?.addEventListener("click", (e) => {
    e.preventDefault();
    void openUrl("https://github.com/zakee039/MDmeow");
  });
  document.getElementById("about-upstream-link")?.addEventListener("click", (e) => {
    e.preventDefault();
    void openUrl("https://github.com/naderi/mowl");
  });

  aboutEl.querySelector(".about-logo")?.addEventListener("click", () => {
    aboutLogoClickCount += 1;
    if (aboutLogoClickTimer !== null) window.clearTimeout(aboutLogoClickTimer);

    if (aboutLogoClickCount >= 5) {
      aboutLogoClickCount = 0;
      aboutLogoClickTimer = null;
      openMikuEaster();
      return;
    }

    aboutLogoClickTimer = window.setTimeout(() => {
      aboutLogoClickCount = 0;
      aboutLogoClickTimer = null;
    }, 1400);
  });

  mikuEasterImage.addEventListener("click", closeMikuEaster);
}

// --- open menu (New / Open) -------------------------------------------

const openMenuEl = document.getElementById("open-menu") as HTMLElement;
const exportMenuEl = document.getElementById("export-menu") as HTMLElement;

function closeOpenMenu(): void {
  openMenuEl.hidden = true;
}

function closeExportMenu(): void {
  exportMenuEl.hidden = true;
  document.getElementById("btn-export")?.setAttribute("aria-expanded", "false");
}

function toggleExportMenu(): void {
  const btn = document.getElementById("btn-export");
  if (!btn) return;
  if (!exportMenuEl.hidden) {
    closeExportMenu();
    return;
  }
  closeOpenMenu();
  const r = btn.getBoundingClientRect();
  exportMenuEl.style.left = `${Math.round(r.left)}px`;
  exportMenuEl.style.top = `${Math.round(r.bottom + 4)}px`;
  exportMenuEl.hidden = false;
  btn.setAttribute("aria-expanded", "true");
}

function wireOpenMenu(): void {
  const btn = document.getElementById("btn-open");
  if (!btn) return;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeExportMenu();
    if (!openMenuEl.hidden) {
      closeOpenMenu();
      return;
    }
    const r = btn.getBoundingClientRect();
    openMenuEl.style.left = `${Math.round(r.left)}px`;
    openMenuEl.style.top = `${Math.round(r.bottom + 4)}px`;
    openMenuEl.hidden = false;
  });
  openMenuEl.addEventListener("click", (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>("button[data-act]")
      ?.dataset.act;
    closeOpenMenu();
    if (act === "new") newTab();
    else if (act === "open") void openDialog();
  });
  document.addEventListener("pointerdown", (e) => {
    if (openMenuEl.hidden) return;
    const t = e.target as HTMLElement;
    if (!openMenuEl.contains(t) && !t.closest("#btn-open")) closeOpenMenu();
  });
  window.addEventListener("resize", closeOpenMenu);
}

function wireExportMenu(): void {
  const btn = document.getElementById("btn-export");
  if (!btn) return;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleExportMenu();
  });
  exportMenuEl.addEventListener("click", (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>("button[data-act]")
      ?.dataset.act;
    closeExportMenu();
    if (act === "html") void exportHtml();
    else if (act === "pdf") void exportPdf();
  });
  document.addEventListener("pointerdown", (e) => {
    if (exportMenuEl.hidden) return;
    const t = e.target as HTMLElement;
    if (!exportMenuEl.contains(t) && !t.closest("#btn-export")) closeExportMenu();
  });
  window.addEventListener("resize", closeExportMenu);
}

// --- wiring --------------------------------------------------------------

function wireShortcuts(): void {
  window.addEventListener(
    "keydown",
    (e) => {
      // Let the focused shortcut control capture the key before app shortcuts
      // (this listener runs in capture phase on window).
      if (settingsPanel.isCapturingShortcut) return;

      if (e.key === "Escape" && (!openMenuEl.hidden || !exportMenuEl.hidden)) {
        e.preventDefault();
        e.stopPropagation();
        closeOpenMenu();
        closeExportMenu();
        return;
      }

      // Esc-to-quit (opt-in). Runs after the block menu's own Esc handler,
      // which stops propagation while it is open.
      if (
        e.key === "Escape" &&
        !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey
      ) {
        if (settingsPanel.isOpen) {
          e.preventDefault();
          settingsPanel.close();
          return;
        }
        if (emojiPicker.isOpen) {
          e.preventDefault();
          emojiPicker.close();
          return;
        }
        if (!openMenuEl.hidden) {
          e.preventDefault();
          closeOpenMenu();
          return;
        }
        if (!mikuEasterEl.hidden) {
          e.preventDefault();
          closeMikuEaster();
          return;
        }
        if (!aboutEl.hidden) {
          e.preventDefault();
          closeAbout();
          return;
        }
        if (findBar.isOpen) {
          e.preventDefault();
          findBar.close();
          return;
        }
        if (settings.quit_on_escape) {
          e.preventDefault();
          void quitApp();
          return;
        }
      }

      if (matchesShortcut(e, settings.shortcuts.save)) {
        e.preventDefault();
        void saveDoc();
      } else if (matchesShortcut(e, settings.shortcuts.save_as)) {
        e.preventDefault();
        void saveAs();
      } else if (matchesShortcut(e, settings.shortcuts.open)) {
        e.preventDefault();
        void openDialog();
      } else if (matchesShortcut(e, settings.shortcuts.new_tab)) {
        e.preventDefault();
        newTab();
      } else if (matchesShortcut(e, settings.shortcuts.close_tab)) {
        e.preventDefault();
        void closeActiveTab();
      } else if (matchesShortcut(e, settings.shortcuts.export)) {
        e.preventDefault();
        toggleExportMenu();
      } else if (matchesShortcut(e, settings.shortcuts.toggle_source)) {
        e.preventDefault();
        toggleSource();
      } else if (matchesShortcut(e, settings.shortcuts.find)) {
        e.preventDefault();
        openFind(false);
      } else if (matchesShortcut(e, settings.shortcuts.replace)) {
        e.preventDefault();
        openFind(true);
      } else if (matchesShortcut(e, settings.shortcuts.emoji)) {
        e.preventDefault();
        emojiPicker.open(codeViewVisible ? null : editor.caretRect());
      } else if (matchesShortcut(e, settings.shortcuts.settings)) {
        e.preventDefault();
        if (settingsPanel.isOpen) settingsPanel.close();
        else settingsPanel.open();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey && !e.altKey &&
        e.key >= "0" && e.key <= "7" && e.key.length === 1
      ) {
        // Ctrl+0..7 → block type, mirroring the ⠿ menu (WYSIWYG only).
        if (codeViewVisible) return;
        e.preventDefault();
        const ids: BlockActionId[] = [
          "text", "h1", "h2", "h3", "bullet", "ordered", "quote", "code",
        ];
        editor.runBlockAction(ids[Number(e.key)]);
      }
    },
    { capture: true },
  );
}

function wireButtons(): void {
  // #btn-open opens a small New / Open menu — see wireOpenMenu().
  document.getElementById("btn-save")?.addEventListener("click", () => void saveDoc());
  document.getElementById("btn-save-as")?.addEventListener("click", () => void saveAs());
  titleEl.addEventListener("pointerdown", (e) => e.stopPropagation());
  titleEl.addEventListener("click", beginTitleRename);
  titleInput.addEventListener("pointerdown", (e) => e.stopPropagation());
  titleInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void commitTitleRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelTitleRename();
      (codeViewVisible ? codeEditor : editor).focus();
    }
  });
  titleInput.addEventListener("blur", () => {
    if (!titleInput.hidden) void commitTitleRename();
  });
  document.getElementById("btn-source")?.addEventListener("click", () => toggleSource());
  document.getElementById("btn-settings")?.addEventListener("click", () => {
    if (settingsPanel.isOpen) settingsPanel.close();
    else settingsPanel.open();
  });
}

/** Immediately write settings, cancelling any pending debounced write. */
async function flushSettings(): Promise<void> {
  window.clearTimeout(persistTimer);
  try {
    await invoke("save_settings", { settings });
  } catch {
    /* nothing we can do on the way out */
  }
}

const WINDOW_GEOMETRY_VERSION = 2;
const GEOMETRY_CAPTURE_DELAY_MS = 180;
let geometryCaptureTimer: number | undefined;

/** Snapshot the current geometry.
 *
 * Position uses physical outer-frame pixels to avoid mixed-DPI drift between
 * monitors. Size stays logical so its perceived size remains stable. */
async function captureGeometry(): Promise<void> {
  if (!settings.remember_window_position) return;
  let minimized = false;
  try {
    minimized = await win.isMinimized();
  } catch {
    /* permission absent -> assume not minimized */
  }
  if (minimized) return;

  const maximized = await win.isMaximized();
  settings.window.maximized = maximized;
  if (maximized) return; // keep the last un-maximized size/pos to restore to

  const [pos, size, scaleFactor] = await Promise.all([
    win.outerPosition(),
    win.innerSize(),
    win.scaleFactor(),
  ]);
  const logicalSize = size.toLogical(scaleFactor || 1);
  if (onScreenish(pos.x, pos.y)) {
    settings.window.x = Math.round(pos.x);
    settings.window.y = Math.round(pos.y);
    settings.window.geometry_version = WINDOW_GEOMETRY_VERSION;
  }
  settings.window.width = Math.round(logicalSize.width);
  settings.window.height = Math.round(logicalSize.height);
}

function scheduleGeometryCapture(): void {
  if (!settings.remember_window_position) return;
  window.clearTimeout(geometryCaptureTimer);
  geometryCaptureTimer = window.setTimeout(() => {
    void captureGeometry().then(() => persistSoon());
  }, GEOMETRY_CAPTURE_DELAY_MS);
}

let closing = false;

/** Save geometry + settings and close, asking about unsaved changes first. */
async function quitApp(): Promise<void> {
  if (closing) return;
  closing = true;
  if (tabBar.tabs.some((tab) => tab.dirty)) {
    const quit = await ask(t("dialog.unsavedQuit"), {
      title: "MDmeow",
      kind: "warning",
    });
    if (!quit) {
      closing = false;
      return;
    }
  }
  window.clearTimeout(geometryCaptureTimer);
  await captureGeometry();
  await flushSettings();
  await win.destroy();
}

async function wireWindowState(): Promise<void> {
  await win.onResized(() => scheduleGeometryCapture());
  await win.onMoved(() => scheduleGeometryCapture());

  await win.onCloseRequested(async (event) => {
    event.preventDefault();
    await quitApp();
  });
}

/** Reject Windows sentinel / corrupt values while still allowing large and
 * negative multi-monitor desktop coordinates. */
function onScreenish(x: number, y: number): boolean {
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    Math.abs(x) < 1_000_000 &&
    Math.abs(y) < 1_000_000
  );
}

function originIsSafeForMonitor(
  x: number,
  y: number,
  monitor: NonNullable<Awaited<ReturnType<typeof primaryMonitor>>>,
): boolean {
  const area = monitor.workArea;
  const left = area.position.x;
  const top = area.position.y;
  const right = left + area.size.width;
  const bottom = top + area.size.height;

  // The title bar must remain safely reachable. If not, the saved position is
  // considered invalid and we fall back to the primary-screen center.
  return x >= left && y >= top && x <= right - 120 && y <= bottom - 48;
}

async function monitorForSavedWindow(w: WindowState) {
  if (
    w.geometry_version !== WINDOW_GEOMETRY_VERSION ||
    w.x === null ||
    w.y === null ||
    !onScreenish(w.x, w.y)
  ) {
    return null;
  }
  try {
    const monitors = await availableMonitors();
    return (
      monitors.find((monitor) => originIsSafeForMonitor(w.x!, w.y!, monitor)) ??
      null
    );
  } catch {
    return null;
  }
}

function fitLogicalSizeToMonitor(
  width: number,
  height: number,
  monitor: NonNullable<Awaited<ReturnType<typeof primaryMonitor>>>,
): { width: number; height: number } {
  const sf = monitor.scaleFactor || 1;
  const maxWidth = Math.max(480, Math.floor((monitor.workArea.size.width - 40) / sf));
  const maxHeight = Math.max(360, Math.floor((monitor.workArea.size.height - 40) / sf));
  return {
    width: Math.min(Math.max(480, width), maxWidth),
    height: Math.min(Math.max(360, height), maxHeight),
  };
}

async function ensureTitleBarVisible(): Promise<void> {
  try {
    const [pos, monitors] = await Promise.all([
      win.outerPosition(),
      availableMonitors(),
    ]);
    if (monitors.some((monitor) => originIsSafeForMonitor(pos.x, pos.y, monitor))) {
      return;
    }

    const [size, sf] = await Promise.all([win.innerSize(), win.scaleFactor()]);
    const logical = size.toLogical(sf || 1);
    await centerOnPrimary(logical.width, logical.height);
  } catch {
    await centerOnPrimary(DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT);
  }
}

async function centerActualWindowOnPrimary(): Promise<void> {
  try {
    const monitor = await primaryMonitor();
    if (!monitor) {
      await win.center();
      return;
    }

    const outer = await win.outerSize();
    const area = monitor.workArea;
    const x =
      area.position.x + Math.max(0, Math.round((area.size.width - outer.width) / 2));
    const y =
      area.position.y + Math.max(0, Math.round((area.size.height - outer.height) / 2));
    await win.setPosition(new PhysicalPosition(x, y));
  } catch {
    try {
      await win.center();
    } catch {
      /* centering is cosmetic; keeping the window visible is preferable */
    }
  }
}

async function centerOnPrimary(width: number, height: number): Promise<void> {
  try {
    const monitor = await primaryMonitor();
    if (monitor) {
      const fitted = fitLogicalSizeToMonitor(width, height, monitor);
      const [oldOuter, oldInner] = await Promise.all([
        win.outerSize(),
        win.innerSize(),
      ]);
      const sf = monitor.scaleFactor || 1;
      const frameWidth = Math.max(0, oldOuter.width - oldInner.width);
      const frameHeight = Math.max(0, oldOuter.height - oldInner.height);
      const targetOuterWidth = Math.round(fitted.width * sf) + frameWidth;
      const targetOuterHeight = Math.round(fitted.height * sf) + frameHeight;
      const area = monitor.workArea;
      const x =
        area.position.x + Math.max(0, Math.round((area.size.width - targetOuterWidth) / 2));
      const y =
        area.position.y + Math.max(0, Math.round((area.size.height - targetOuterHeight) / 2));

      await win.setSize(new LogicalSize(fitted.width, fitted.height));
      await win.setPosition(new PhysicalPosition(x, y));
      return;
    }
  } catch {
    /* fall through to Tauri's native centering */
  }
  try {
    await win.center();
  } catch {
    /* centering is cosmetic; showing the window is still preferable */
  }
}

async function restoreWindow(): Promise<void> {
  const w = settings.window;
  await win.unmaximize();

  if (settings.remember_window_position) {
    const width = w.width > 200 ? w.width : DEFAULT_WINDOW_WIDTH;
    const height = w.height > 150 ? w.height : DEFAULT_WINDOW_HEIGHT;
    const monitor = await monitorForSavedWindow(w);

    if (monitor) {
      const fitted = fitLogicalSizeToMonitor(width, height, monitor);
      await win.setSize(new LogicalSize(fitted.width, fitted.height));
      await win.setPosition(
        new PhysicalPosition(Math.round(w.x!), Math.round(w.y!)),
      );

      const actual = await win.outerPosition();
      if (!originIsSafeForMonitor(actual.x, actual.y, monitor)) {
        await centerOnPrimary(fitted.width, fitted.height);
      }
    } else {
      await centerOnPrimary(width, height);
    }
    if (w.maximized) await win.maximize();
  } else {
    await centerOnPrimary(DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT);
  }
  await win.show();
  if (!(await win.isMaximized())) {
    if (settings.remember_window_position) {
      await ensureTitleBarVisible();
    } else {
      // On Windows/WebView2, a hidden resize can settle after setSize()
      // resolves. Recenter once more after show using the real outer frame so
      // mixed-DPI systems never calculate the center from a stale size.
      await centerActualWindowOnPrimary();
    }
  }
  try {
    await win.setFocus();
  } catch {
    /* permission may be absent; not critical */
  }
}

async function restoreTabs(): Promise<void> {
  if (settings.open_last_session === false) {
    tabBar.add(null, "");
    return;
  }

  const files = settings.open_files ?? [];
  const readable: string[] = [];
  for (const path of files) {
    if (path && (await fileReadable(path))) {
      readable.push(path);
    }
  }

  if (readable.length === 0) {
    tabBar.add(null, "");
    return;
  }

  for (const path of readable) {
    const text = await invoke<string>("read_document", { path });
    tabBar.add(path, text, false);
  }
  const idx = Math.min(Math.max(settings.active_tab ?? 0, 0), readable.length - 1);
  tabBar.activate(tabBar.tabs[idx].id);
}

async function bootstrap(): Promise<void> {
  const payload = await invoke<SettingsPayload>("get_settings");
  settings = payload.settings;
  settings.shortcuts = withDefaultShortcuts(settings.shortcuts);
  if (!isListMarker(settings.list_marker)) settings.list_marker = "*";

  setLang(settings.language ?? "system");
  applyStaticI18n();
  settingsPanel.setPath(payload.location);
  settingsPanel.setVersion(payload.version);
  settingsPanel.refresh();
  applyAppearance();
  installMikuCreamRendering();
  editor.setListMarker(settings.list_marker);
  applyProxySettings(false);
  tabBar.setAlwaysShow(settings.always_show_tabbar);

  // React to hand edits of settings.toml (the file watcher emits this).
  void listen<Settings>("settings-changed", (e) => {
    const ext = e.payload;
    settings.language = ext.language ?? "system";
    settings.spellcheck = ext.spellcheck;
    settings.quit_on_escape = ext.quit_on_escape;
    settings.show_path = ext.show_path;
    settings.open_last_session = ext.open_last_session;
    settings.always_show_tabbar = ext.always_show_tabbar;
    tabBar.setAlwaysShow(ext.always_show_tabbar);
    settings.editor_font = ext.editor_font;
    settings.editor_font_size = ext.editor_font_size;
    settings.source_font = ext.source_font;
    settings.source_font_size = ext.source_font_size;
    settings.code_alternate_rows = ext.code_alternate_rows;
    settings.code_alternate_row_color = ext.code_alternate_row_color;
    settings.remember_window_position = ext.remember_window_position;
    settings.file_associations = ext.file_associations;
    settings.accent = ext.accent;
    settings.proxy_enabled = ext.proxy_enabled;
    settings.proxy_url = ext.proxy_url;
    settings.auto_check_updates = ext.auto_check_updates;
    settings.last_update_check = ext.last_update_check;
    settings.shortcuts = withDefaultShortcuts(ext.shortcuts);
    settings.open_with_prompt_dismissed = ext.open_with_prompt_dismissed;
    applyLanguage(settings.language); // no-op if unchanged
    applyAppearance();
    codeEditor.setAlternateRows(settings.code_alternate_rows);
    applyProxySettings(true);
    updateShortcutTitles();
    editor.setSpellcheck(settings.spellcheck);
    updateTitle();
    settingsPanel.refresh();

    if (isListMarker(ext.list_marker) && ext.list_marker !== settings.list_marker) {
      settings.list_marker = ext.list_marker;
      editor.setListMarker(ext.list_marker);
      if (!codeViewVisible) {
        switching = true;
        void editor.reload().then(() => {
          editor.setSpellcheck(settings.spellcheck);
          switching = false;
          markDirtyFromView();
        });
      }
    }
  });

  const aboutVersion = document.getElementById("about-version");
  if (aboutVersion) aboutVersion.textContent = `v${payload.version}`;
  const aboutPath = document.getElementById("about-settings-path");
  if (aboutPath) aboutPath.textContent = payload.location;

  if (payload.fallback) {
    const hint = document.getElementById("settings-hint") as HTMLElement;
    hint.textContent = t("dialog.readonlyHint", { path: payload.location });
    hint.hidden = false;
  }

  await editor.init("");

  // Show the window early so a slow or failing later step can never leave it
  // stuck hidden in the taskbar.
  await restoreWindow();

  await restoreTabs();

  // A file passed on the command line (double-click / "Open with").
  if (payload.open_with) await openPath(payload.open_with);

  // Further "open with" launches are routed here by the single-instance plugin.
  void listen<string>("open-file", async (e) => {
    await openPath(e.payload);
    try {
      await win.unminimize();
      await win.setFocus();
    } catch {
      /* not critical */
    }
  });

  wireButtons();
  wireAbout();
  void listen<VersionTransferProgress>("update-download-progress", (event) => {
    if (!versionBusy) return;
    setUpdateProgress(event.payload.downloaded, event.payload.total);
  });
  wireOpenMenu();
  wireExportMenu();
  await wireFileDrop();
  updateSourceButton();
  updateShortcutTitles();
  wireShortcuts();
  await wireWindowState();

  // Do not block first paint on registry inspection. The lightweight Windows
  // Open With check runs only after the main window and editor are ready.
  void initializeOpenWithIntegration();
  maybeCheckVersionInBackground();
}

bootstrap().catch(async (e) => {
  try {
    await win.show();
    await win.setFocus();
  } catch {
    /* ignore */
  }
  await message(t("dialog.startupFailed", { err: String(e) }), {
    title: "MDmeow",
    kind: "error",
  });
});
