// Tiny in-app i18n. Covers Mowl's own chrome (toolbar, settings panel, About,
// dialogs, tab bar, find/replace, the block menu, the emoji picker) plus the
// editor placeholder. Milkdown/Crepe's own micro-UI (slash menu, link/table
// tooltips, image upload, LaTeX, code language picker) stays English.
//
// No app imports — this is a leaf module.

export type LangPref = "system" | "en" | "de" | "zh-CN";
export type Lang = "en" | "de" | "zh-CN";

const EN = {
  "toolbar.about.title": "About Mowl",
  "toolbar.open.title": "New / Open (Ctrl/Cmd+N, Ctrl/Cmd+O)",
  "toolbar.open.aria": "New or open file",
  "toolbar.save.title": "Save (Ctrl/Cmd+S)",
  "toolbar.save.aria": "Save",
  "toolbar.export.title": "Export HTML / PDF",
  "toolbar.export.aria": "Export",
  "toolbar.source.title": "Edit Markdown source",
  "toolbar.sourceBack.title": "Back to formatted view",
  "toolbar.source.aria": "Toggle source view",
  "toolbar.ltr.title": "Left-to-right",
  "toolbar.ltr.aria": "Left-to-right text",
  "toolbar.rtl.title": "Right-to-left",
  "toolbar.rtl.aria": "Right-to-left text",
  "toolbar.settings.title": "Settings (Ctrl/Cmd+,)",
  "toolbar.settings.aria": "Settings",

  "menu.new": "New",
  "menu.open": "Open…",

  "about.tagline": "Portable WYSIWYG Markdown editor",
  "about.credit": "by Ali Naderi · MIT License",
  "about.close": "Close",

  "doc.untitled": "Untitled",

  "tab.close": "Close tab",
  "tab.new": "New tab",

  "block.text": "Text",
  "block.h1": "Heading 1",
  "block.h2": "Heading 2",
  "block.h3": "Heading 3",
  "block.bulletList": "Bullet list",
  "block.numberedList": "Numbered list",
  "block.quote": "Quote",
  "block.codeBlock": "Code block",
  "block.table": "Table",
  "block.image": "Image",
  "block.divider": "Divider",
  "block.insertAbove": "Insert line above",
  "block.insertBelow": "Insert line below",
  "block.duplicate": "Duplicate",
  "block.delete": "Delete",

  "find.find": "Find",
  "find.replace": "Replace",
  "find.replaceWith": "Replace with",
  "find.prev": "Previous match",
  "find.next": "Next match",
  "find.prev.title": "Previous match (Shift+Enter)",
  "find.next.title": "Next match (Enter)",
  "find.matchCase": "Match case",
  "find.close": "Close (Esc)",
  "find.replaceBtn": "Replace",
  "find.all": "All",

  "emoji.search": "Search emoji…",
  "emoji.noMatches": "No matches",

  "dialog.discardChanges": "Discard unsaved changes to {name}?",
  "dialog.unsavedQuit": "You have unsaved changes. Quit without saving?",
  "dialog.htmlExported": "HTML exported.",
  "dialog.chooseExport": "Export as HTML file?  (No = print / save as PDF)",
  "dialog.exportTitle": "Export",
  "dialog.startupFailed": "Startup failed: {err}",
  "dialog.readonlyHint": "Program folder is read-only — settings saved to {path}",
  "dialog.openWithPrompt": "Register Mowl in Windows ‘Open with’ for Markdown files? This will not change your default app.",
  "dialog.openWithError": "Could not update Windows Open with registration: {err}",

  "editor.placeholder": "Write here — “/” for blocks, the ⠿ button to change the current one",

  "settings.title": "Settings",
  "settings.savedNote": "Changes are saved immediately.",
  "settings.fileAt": "settings.toml: {path}",
  "settings.section.appearance": "Language & appearance",
  "settings.section.editor": "Editor",
  "settings.section.behavior": "Behaviour",
  "settings.section.shortcuts": "Shortcuts",
  "settings.section.fonts": "Fonts",
  "settings.section.system": "System",

  "settings.language": "Language",
  "settings.language.system": "System",
  "settings.language.en": "English",
  "settings.language.de": "Deutsch",
  "settings.language.zh-CN": "简体中文",
  "settings.direction": "Writing direction",
  "settings.direction.hint": "default for new files (each file keeps its own)",
  "settings.direction.ltr": "Left-to-right",
  "settings.direction.rtl": "Right-to-left",
  "settings.spellcheck": "Spell-check squiggles in the editor",
  "settings.quitOnEscape": "Press Esc to quit the app",
  "settings.alwaysShowTabbar": "Always show the tab bar (even with one file)",
  "settings.openLastSession": "Reopen the previous session's tabs on startup",
  "settings.showPath": "Show the full file path in the header",
  "settings.listMarker": "Bullet-list marker (on save)",
  "settings.editorFont": "Editor font",
  "settings.editorFont.placeholder": "system default",
  "settings.editorFontSize": "Editor font size (px)",
  "settings.sourceFont": "Source-view font",
  "settings.sourceFont.placeholder": "system monospace",
  "settings.sourceFontSize": "Source font size (px)",
  "settings.accent": "Accent colour",
  "settings.accent.clear": "Reset",
  "settings.openWith": "Register in system Open with",
  "settings.openWith.register": "Register",
  "settings.openWith.remove": "Remove",
  "settings.shortcut.newTab": "New tab",
  "settings.shortcut.open": "Open",
  "settings.shortcut.save": "Save",
  "settings.shortcut.saveAs": "Save as",
  "settings.shortcut.closeTab": "Close tab",
  "settings.shortcut.export": "Export HTML / PDF",
  "settings.shortcut.toggleSource": "Toggle source view",
  "settings.shortcut.find": "Find",
  "settings.shortcut.replace": "Replace",
  "settings.shortcut.emoji": "Emoji picker",
  "settings.shortcut.settings": "Settings",
  "settings.shortcut.capture": "Press shortcut…",
  "settings.shortcut.conflict": "This shortcut is already in use.",
  "settings.shortcut.cancelHint": "Press Esc to cancel",
};

export type I18nKey = keyof typeof EN;

const DE: Partial<Record<I18nKey, string>> = {
  "toolbar.about.title": "Über Mowl",
  "toolbar.open.title": "Neu / Öffnen (Strg/Cmd+N, Strg/Cmd+O)",
  "toolbar.open.aria": "Neue Datei / Datei öffnen",
  "toolbar.save.title": "Speichern (Strg/Cmd+S)",
  "toolbar.save.aria": "Speichern",
  "toolbar.export.title": "Als HTML / PDF exportieren",
  "toolbar.export.aria": "Exportieren",
  "toolbar.source.title": "Markdown-Quelltext bearbeiten",
  "toolbar.sourceBack.title": "Zurück zur formatierten Ansicht",
  "toolbar.source.aria": "Quelltextansicht umschalten",
  "toolbar.ltr.title": "Links nach rechts",
  "toolbar.ltr.aria": "Text links nach rechts",
  "toolbar.rtl.title": "Rechts nach links",
  "toolbar.rtl.aria": "Text rechts nach links",
  "toolbar.settings.title": "Einstellungen (Strg/Cmd+,)",
  "toolbar.settings.aria": "Einstellungen",

  "menu.new": "Neu",
  "menu.open": "Öffnen…",

  "about.tagline": "Portabler WYSIWYG-Markdown-Editor",
  "about.credit": "von Ali Naderi · MIT-Lizenz",
  "about.close": "Schließen",

  "doc.untitled": "Ohne Titel",

  "tab.close": "Tab schließen",
  "tab.new": "Neuer Tab",

  "block.text": "Text",
  "block.h1": "Überschrift 1",
  "block.h2": "Überschrift 2",
  "block.h3": "Überschrift 3",
  "block.bulletList": "Stichpunktliste",
  "block.numberedList": "Nummerierte Liste",
  "block.quote": "Zitat",
  "block.codeBlock": "Codeblock",
  "block.table": "Tabelle",
  "block.image": "Bild",
  "block.divider": "Trennlinie",
  "block.insertAbove": "Zeile darüber einfügen",
  "block.insertBelow": "Zeile darunter einfügen",
  "block.duplicate": "Duplizieren",
  "block.delete": "Löschen",

  "find.find": "Suchen",
  "find.replace": "Ersetzen",
  "find.replaceWith": "Ersetzen durch",
  "find.prev": "Vorheriger Treffer",
  "find.next": "Nächster Treffer",
  "find.prev.title": "Vorheriger Treffer (Umschalt+Enter)",
  "find.next.title": "Nächster Treffer (Enter)",
  "find.matchCase": "Groß-/Kleinschreibung beachten",
  "find.close": "Schließen (Esc)",
  "find.replaceBtn": "Ersetzen",
  "find.all": "Alle",

  "emoji.search": "Emoji suchen…",
  "emoji.noMatches": "Keine Treffer",

  "dialog.discardChanges": "Ungespeicherte Änderungen an {name} verwerfen?",
  "dialog.unsavedQuit": "Es gibt ungespeicherte Änderungen. Ohne Speichern beenden?",
  "dialog.htmlExported": "HTML exportiert.",
  "dialog.chooseExport": "Als HTML-Datei exportieren?  (Nein = drucken / als PDF speichern)",
  "dialog.exportTitle": "Exportieren",
  "dialog.startupFailed": "Start fehlgeschlagen: {err}",
  "dialog.readonlyHint": "Programmordner ist schreibgeschützt — Einstellungen gespeichert unter {path}",

  "editor.placeholder": "Hier schreiben — „/“ für Blöcke, den ⠿-Knopf für den aktuellen Block",

  "settings.title": "Einstellungen",
  "settings.savedNote": "Änderungen werden sofort gespeichert.",
  "settings.fileAt": "settings.toml: {path}",
  "settings.section.appearance": "Sprache & Darstellung",
  "settings.section.editor": "Editor",
  "settings.section.behavior": "Verhalten",
  "settings.section.fonts": "Schriften",

  "settings.language": "Sprache",
  "settings.language.system": "System",
  "settings.language.en": "English",
  "settings.language.de": "Deutsch",
  "settings.direction": "Schreibrichtung",
  "settings.direction.hint": "Standard für neue Dateien (jede Datei behält ihre eigene)",
  "settings.direction.ltr": "Links nach rechts",
  "settings.direction.rtl": "Rechts nach links",
  "settings.spellcheck": "Rechtschreib-Wellenlinien im Editor",
  "settings.quitOnEscape": "Mit Esc die App beenden",
  "settings.alwaysShowTabbar": "Tab-Leiste immer zeigen (auch bei einer Datei)",
  "settings.openLastSession": "Tabs der letzten Sitzung beim Start wieder öffnen",
  "settings.showPath": "Vollständigen Dateipfad in der Kopfzeile zeigen",
  "settings.listMarker": "Listenzeichen (beim Speichern)",
  "settings.editorFont": "Editor-Schrift",
  "settings.editorFont.placeholder": "System-Standard",
  "settings.editorFontSize": "Editor-Schriftgröße (px)",
  "settings.sourceFont": "Quelltext-Schrift",
  "settings.sourceFont.placeholder": "System-Monospace",
  "settings.sourceFontSize": "Quelltext-Schriftgröße (px)",
  "settings.accent": "Akzentfarbe",
  "settings.accent.clear": "Zurücksetzen",
};

const ZH_CN: Partial<Record<I18nKey, string>> = {
  "toolbar.about.title": "关于 Mowl",
  "toolbar.open.title": "新建 / 打开（Ctrl/Cmd+N，Ctrl/Cmd+O）",
  "toolbar.open.aria": "新建或打开文件",
  "toolbar.save.title": "保存（Ctrl/Cmd+S）",
  "toolbar.save.aria": "保存",
  "toolbar.export.title": "导出 HTML / PDF",
  "toolbar.export.aria": "导出",
  "toolbar.source.title": "编辑 Markdown 源码",
  "toolbar.sourceBack.title": "返回所见即所得视图",
  "toolbar.source.aria": "切换源码视图",
  "toolbar.ltr.title": "从左到右",
  "toolbar.ltr.aria": "从左到右文本",
  "toolbar.rtl.title": "从右到左",
  "toolbar.rtl.aria": "从右到左文本",
  "toolbar.settings.title": "设置（Ctrl/Cmd+,）",
  "toolbar.settings.aria": "设置",

  "menu.new": "新建",
  "menu.open": "打开…",

  "about.tagline": "便携式所见即所得 Markdown 编辑器",
  "about.credit": "Ali Naderi · MIT License",
  "about.close": "关闭",

  "doc.untitled": "未命名",

  "tab.close": "关闭标签页",
  "tab.new": "新建标签页",

  "block.text": "正文",
  "block.h1": "一级标题",
  "block.h2": "二级标题",
  "block.h3": "三级标题",
  "block.bulletList": "项目符号列表",
  "block.numberedList": "编号列表",
  "block.quote": "引用",
  "block.codeBlock": "代码块",
  "block.table": "表格",
  "block.image": "图片",
  "block.divider": "分隔线",
  "block.insertAbove": "在上方插入一行",
  "block.insertBelow": "在下方插入一行",
  "block.duplicate": "复制",
  "block.delete": "删除",

  "find.find": "查找",
  "find.replace": "替换",
  "find.replaceWith": "替换为",
  "find.prev": "上一个匹配项",
  "find.next": "下一个匹配项",
  "find.prev.title": "上一个匹配项（Shift+Enter）",
  "find.next.title": "下一个匹配项（Enter）",
  "find.matchCase": "区分大小写",
  "find.close": "关闭（Esc）",
  "find.replaceBtn": "替换",
  "find.all": "全部",

  "emoji.search": "搜索 Emoji…",
  "emoji.noMatches": "没有匹配项",

  "dialog.discardChanges": "放弃对 {name} 的未保存更改吗？",
  "dialog.unsavedQuit": "仍有未保存的更改。确定不保存并退出吗？",
  "dialog.htmlExported": "HTML 已导出。",
  "dialog.chooseExport": "导出为 HTML 文件吗？（选择“否”将打印 / 另存为 PDF）",
  "dialog.exportTitle": "导出",
  "dialog.startupFailed": "启动失败：{err}",
  "dialog.readonlyHint": "程序目录为只读，设置已保存到 {path}",
  "dialog.openWithPrompt": "是否将 Mowl 注册到 Windows 的 Markdown 打开方式？这不会更改你的默认应用。",
  "dialog.openWithError": "更新 Windows 打开方式注册失败：{err}",

  "editor.placeholder": "在此输入 — 输入“/”插入内容块，点击 ⠿ 更改当前块类型",

  "settings.title": "设置",
  "settings.savedNote": "更改会立即保存。",
  "settings.fileAt": "settings.toml：{path}",
  "settings.section.appearance": "语言与外观",
  "settings.section.editor": "编辑器",
  "settings.section.behavior": "行为",
  "settings.section.shortcuts": "快捷键",
  "settings.section.fonts": "字体",
  "settings.section.system": "系统",

  "settings.language": "语言",
  "settings.language.system": "跟随系统",
  "settings.language.en": "English",
  "settings.language.de": "Deutsch",
  "settings.language.zh-CN": "简体中文",
  "settings.direction": "书写方向",
  "settings.direction.hint": "新文件的默认方向（每个文件会保留自己的方向）",
  "settings.direction.ltr": "从左到右",
  "settings.direction.rtl": "从右到左",
  "settings.spellcheck": "在编辑器中显示拼写检查波浪线",
  "settings.quitOnEscape": "按 Esc 退出应用",
  "settings.alwaysShowTabbar": "始终显示标签栏（即使只有一个文件）",
  "settings.openLastSession": "启动时恢复上一次会话的标签页",
  "settings.showPath": "在标题栏中显示完整文件路径",
  "settings.listMarker": "项目符号标记（保存时）",
  "settings.editorFont": "编辑器字体",
  "settings.editorFont.placeholder": "系统默认",
  "settings.editorFontSize": "编辑器字号（px）",
  "settings.sourceFont": "源码视图字体",
  "settings.sourceFont.placeholder": "系统等宽字体",
  "settings.sourceFontSize": "源码字号（px）",
  "settings.accent": "强调色",
  "settings.accent.clear": "重置",
  "settings.openWith": "注册到系统打开方式",
  "settings.openWith.register": "注册",
  "settings.openWith.remove": "移除",
  "settings.shortcut.newTab": "新建标签页",
  "settings.shortcut.open": "打开",
  "settings.shortcut.save": "保存",
  "settings.shortcut.saveAs": "另存为",
  "settings.shortcut.closeTab": "关闭标签页",
  "settings.shortcut.export": "导出 HTML / PDF",
  "settings.shortcut.toggleSource": "切换源码视图",
  "settings.shortcut.find": "查找",
  "settings.shortcut.replace": "替换",
  "settings.shortcut.emoji": "Emoji 选择器",
  "settings.shortcut.settings": "设置",
  "settings.shortcut.capture": "请按下快捷键…",
  "settings.shortcut.conflict": "该快捷键已被使用。",
  "settings.shortcut.cancelHint": "按 Esc 取消",
};

const DICT: Record<Lang, Partial<Record<I18nKey, string>>> = {
  en: EN,
  de: DE,
  "zh-CN": ZH_CN,
};

let current: Lang = "en";
const listeners = new Set<() => void>();

export function resolveLang(pref: LangPref): Lang {
  if (pref === "system") {
    const locale = navigator.language.toLowerCase();
    if (locale.startsWith("zh")) return "zh-CN";
    if (locale.startsWith("de")) return "de";
    return "en";
  }
  return pref;
}

export function getLang(): Lang {
  return current;
}

/** Set the active language and notify listeners (no-op if unchanged). */
export function setLang(pref: LangPref): void {
  const next = resolveLang(pref);
  if (next === current) return;
  current = next;
  document.documentElement.lang = current;
  for (const cb of listeners) cb();
}

export function onLangChange(cb: () => void): void {
  listeners.add(cb);
}

export function t(
  key: I18nKey,
  vars?: Record<string, string | number>,
): string {
  const s = DICT[current][key] ?? EN[key] ?? key;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) =>
    k in vars ? String(vars[k]) : `{${k}}`,
  );
}

/** Apply `data-i18n` / `data-i18n-title` / `data-i18n-aria` attributes. */
export function applyStaticI18n(root: ParentNode = document): void {
  document.documentElement.lang = current;
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n as I18nKey);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle as I18nKey);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAria as I18nKey));
  });
}
