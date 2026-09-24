// The settings GUI: a full-screen overlay that fades in over the editor
// (Ctrl/Cmd+, or the gear button). One control per hand-editable settings.toml
// key. The panel is "dumb" — it renders controls and reports every change via
// `onChange`; main.ts owns the settings object, the apply-functions and the
// debounced save. App-managed keys (window geometry, open files) are not shown.

import { t, type I18nKey } from "./i18n";
import {
  formatShortcut,
  shortcutFromEvent,
  type ShortcutAction,
  type ShortcutSettings,
} from "./shortcuts";
import {
  FILE_CATEGORY_ORDER,
  allAssociationExtensions,
  associationExtensionsByCategory,
  type FileCategoryId,
} from "./file-types";

/** The subset of `Settings` (main.ts) the panel reads/writes. */
export interface PanelSettings {
  language: string;
  spellcheck: boolean;
  quit_on_escape: boolean;
  always_show_tabbar: boolean;
  open_last_session: boolean;
  show_path: boolean;
  list_marker: string;
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
}

export type SettingKey = keyof PanelSettings;
type SettingValue = string | number | boolean | string[];
type SettingsTab = "general" | "editor" | "shortcuts" | "associations" | "updates";

type Field =
  | { key: SettingKey; kind: "checkbox"; label: I18nKey }
  | {
      key: SettingKey;
      kind: "select";
      label: I18nKey;
      hint?: I18nKey;
      options: { value: string; label: I18nKey }[];
    }
  | { key: SettingKey; kind: "text"; label: I18nKey; placeholder?: I18nKey }
  | { key: SettingKey; kind: "number"; label: I18nKey; min: number; max: number }
  | { key: SettingKey; kind: "color"; label: I18nKey; defaultColor?: string }
  | {
      key: SettingKey;
      colorKey: SettingKey;
      kind: "checkboxColor";
      label: I18nKey;
      defaultColor: string;
    }
  | { action: ShortcutAction; kind: "shortcut"; label: I18nKey }
  | { action: "open_with"; kind: "action"; label: I18nKey };

interface Section {
  tab: SettingsTab;
  title: I18nKey;
  fields?: Field[];
  custom?: "proxy";
}

const SECTIONS: Section[] = [
  {
    tab: "general",
    title: "settings.section.appearance",
    fields: [
      {
        key: "language",
        kind: "select",
        label: "settings.language",
        options: [
          { value: "system", label: "settings.language.system" },
          { value: "en", label: "settings.language.en" },
          { value: "de", label: "settings.language.de" },
          { value: "ja", label: "settings.language.ja" },
          { value: "zh-CN", label: "settings.language.zh-CN" },
        ],
      },
      {
        key: "accent",
        kind: "color",
        label: "settings.accent",
        defaultColor: "#39C5BB",
      },
    ],
  },
  {
    tab: "general",
    title: "settings.section.behavior",
    fields: [
      { key: "quit_on_escape", kind: "checkbox", label: "settings.quitOnEscape" },
      {
        key: "always_show_tabbar",
        kind: "checkbox",
        label: "settings.alwaysShowTabbar",
      },
      {
        key: "open_last_session",
        kind: "checkbox",
        label: "settings.openLastSession",
      },
      {
        key: "remember_window_position",
        kind: "checkbox",
        label: "settings.rememberWindowPosition",
      },
    ],
  },
  {
    tab: "general",
    title: "settings.section.proxy",
    custom: "proxy",
  },
  {
    tab: "editor",
    title: "settings.section.editor",
    fields: [
      { key: "spellcheck", kind: "checkbox", label: "settings.spellcheck" },
      {
        key: "list_marker",
        kind: "select",
        label: "settings.listMarker",
        options: [
          { value: "*", label: "settings.language.system" }, // label overridden below
          { value: "-", label: "settings.language.system" },
          { value: "+", label: "settings.language.system" },
        ],
      },
      { key: "show_path", kind: "checkbox", label: "settings.showPath" },
      {
        key: "code_alternate_rows",
        colorKey: "code_alternate_row_color",
        kind: "checkboxColor",
        label: "settings.codeAlternateRows",
        defaultColor: "#FAFFFF",
      },
    ],
  },
  {
    tab: "shortcuts",
    title: "settings.section.shortcuts",
    fields: [
      { action: "new_tab", kind: "shortcut", label: "settings.shortcut.newTab" },
      { action: "open", kind: "shortcut", label: "settings.shortcut.open" },
      { action: "save", kind: "shortcut", label: "settings.shortcut.save" },
      { action: "save_as", kind: "shortcut", label: "settings.shortcut.saveAs" },
      { action: "close_tab", kind: "shortcut", label: "settings.shortcut.closeTab" },
      { action: "export", kind: "shortcut", label: "settings.shortcut.export" },
      {
        action: "toggle_source",
        kind: "shortcut",
        label: "settings.shortcut.toggleSource",
      },
      { action: "find", kind: "shortcut", label: "settings.shortcut.find" },
      { action: "replace", kind: "shortcut", label: "settings.shortcut.replace" },
      { action: "emoji", kind: "shortcut", label: "settings.shortcut.emoji" },
      { action: "settings", kind: "shortcut", label: "settings.shortcut.settings" },
    ],
  },
  {
    tab: "editor",
    title: "settings.section.fonts",
    fields: [
      {
        key: "editor_font",
        kind: "text",
        label: "settings.editorFont",
        placeholder: "settings.editorFont.placeholder",
      },
      {
        key: "editor_font_size",
        kind: "number",
        label: "settings.editorFontSize",
        min: 8,
        max: 40,
      },
      {
        key: "source_font",
        kind: "text",
        label: "settings.sourceFont",
        placeholder: "settings.sourceFont.placeholder",
      },
      {
        key: "source_font_size",
        kind: "number",
        label: "settings.sourceFontSize",
        min: 8,
        max: 40,
      },
    ],
  },
  {
    tab: "updates",
    title: "settings.tab.updates",
    fields: [
      {
        key: "auto_check_updates",
        kind: "checkbox",
        label: "settings.autoCheckUpdates",
      },
    ],
  },
];

export class SettingsPanel {
  #el: HTMLElement;
  #open = false;
  #activeTab: SettingsTab = "general";
  #get: () => PanelSettings;
  #path = "";
  #capturingShortcut: ShortcutAction | null = null;
  #openWithAvailable = false;
  #openWithRegistered = false;
  #openWithManagedByMsi = false;
  #openWithCanModify = false;
  #openWithBusy = false;
  #proxyTestBusy = false;
  #proxyTestState: "idle" | "ok" | "error" = "idle";
  #proxyTestDetail = "";
  #associationAvailable = false;
  #associationBusy = false;
  #registeredExtensions = new Set<string>();
  #appVersion = "";
  #updateBusy = false;
  #updateStatus = "";

  /** Reports every user change. main.ts applies + persists. */
  onChange: (key: SettingKey, value: SettingValue) => void =
    () => {};
  onShortcutChange: (action: ShortcutAction, value: string) => void = () => {};
  onOpenWithToggle: () => void | Promise<void> = () => {};
  onRegisterAssociations: (extensions: string[]) => Promise<void> = async () => {};
  onSetDefaultAssociations: (extensions: string[]) => Promise<void> = async () => {};
  onCheckUpdates: () => Promise<string> = async () => "";
  onProxyTest: (proxyUrl: string) => Promise<void> = async () => {};
  /** Return focus to the editor after closing. */
  onClose: () => void = () => {};

  constructor(getSettings: () => PanelSettings) {
    this.#get = getSettings;
    this.#el = document.createElement("div");
    this.#el.id = "settings-panel";
    this.#el.hidden = true;
    document.body.appendChild(this.#el);
    this.#build();
  }

  /** The settings.toml path shown in the footer (known after get_settings). */
  setPath(path: string): void {
    this.#path = path;
    const foot = this.#el.querySelector(".settings-foot");
    if (foot) {
      foot.textContent = `${t("settings.savedNote")}  ${t("settings.fileAt", {
        path,
      })}`;
    }
  }

  get isOpen(): boolean {
    return this.#open;
  }

  get isCapturingShortcut(): boolean {
    return this.#capturingShortcut !== null;
  }

  setOpenWithStatus(
    available: boolean,
    registered: boolean,
    managedByMsi: boolean,
    canModify: boolean,
  ): void {
    this.#openWithAvailable = available;
    this.#openWithRegistered = registered;
    this.#openWithManagedByMsi = managedByMsi;
    this.#openWithCanModify = canModify;
    this.#refreshOpenWithControl();
  }

  setOpenWithBusy(busy: boolean): void {
    this.#openWithBusy = busy;
    this.#refreshOpenWithControl();
  }

  setAssociationStatus(available: boolean, registeredExtensions: string[]): void {
    this.#associationAvailable = available;
    this.#registeredExtensions = new Set(registeredExtensions.map((ext) => ext.toLowerCase()));
    if (this.#activeTab === "associations") this.#renderActiveTab();
  }

  setVersion(version: string): void {
    this.#appVersion = version;
    if (this.#activeTab === "updates") this.#renderActiveTab();
  }

  #refreshOpenWithControl(): void {
    const row = this.#el.querySelector<HTMLElement>('[data-system-action="open_with"]');
    const btn = row?.querySelector<HTMLButtonElement>(".settings-action");
    if (!row || !btn) return;
    row.hidden = !this.#openWithAvailable;
    btn.disabled = this.#openWithBusy || !this.#openWithCanModify;
    if (this.#openWithManagedByMsi && !this.#openWithCanModify) {
      btn.textContent = t("settings.openWith.installed");
    } else {
      btn.textContent = t(
        this.#openWithRegistered ? "settings.openWith.remove" : "settings.openWith.register",
      );
    }
  }

  open(): void {
    this.#el.hidden = false;
    this.refresh();
    // next frame so the transition runs from the hidden state
    requestAnimationFrame(() => {
      document.getElementById("app")?.classList.add("settings-open");
      this.#el.classList.add("open");
      this.#open = true;
      this.#el.querySelector<HTMLElement>("select, input, button")?.focus();
    });
  }

  close(): void {
    if (!this.#open) return;
    this.#capturingShortcut = null;
    this.#open = false;
    this.#el.classList.remove("open");
    document.getElementById("app")?.classList.remove("settings-open");
    const done = () => {
      if (!this.#open) this.#el.hidden = true;
      this.#el.removeEventListener("transitionend", done);
    };
    this.#el.addEventListener("transitionend", done);
    window.setTimeout(done, 180); // fallback if transitionend is missed
    this.onClose();
  }

  /** Rewrite every control from the current settings. */
  refresh(): void {
    if (this.#activeTab === "associations") {
      this.#renderActiveTab();
      return;
    }
    const s = this.#get();
    for (const section of SECTIONS) {
      if (section.custom === "proxy") {
        this.#refreshProxyControls();
        continue;
      }
      for (const f of section.fields ?? []) {
        if (f.kind === "action") {
          this.#refreshOpenWithControl();
          continue;
        }
        if (f.kind === "shortcut") {
          const btn = this.#el.querySelector<HTMLButtonElement>(
            `[data-shortcut="${f.action}"]`,
          );
          if (btn && this.#capturingShortcut !== f.action) {
            btn.textContent = formatShortcut(s.shortcuts[f.action]);
            btn.classList.remove("listening", "conflict");
            btn.title = "";
          }
          continue;
        }
        if (f.kind === "checkboxColor") {
          const row = this.#el.querySelector<HTMLElement>(`[data-key="${f.key}"]`);
          if (!row) continue;
          const cb = row.querySelector<HTMLInputElement>('input[type="checkbox"]');
          if (cb) cb.checked = Boolean(s[f.key]);
          this.#refreshColorControl(
            row.querySelector<HTMLElement>(`[data-color-key="${f.colorKey}"]`),
            s[f.colorKey],
            f.defaultColor,
          );
          continue;
        }
        const ctl = this.#el.querySelector<HTMLElement>(`[data-key="${f.key}"]`);
        if (!ctl) continue;
        const raw = s[f.key];
        if (f.kind === "checkbox") {
          (ctl as HTMLInputElement).checked = Boolean(raw);
        } else if (f.kind === "color") {
          this.#refreshColorControl(ctl, raw, f.defaultColor ?? "#39C5BB");
        } else {
          (ctl as HTMLInputElement | HTMLSelectElement).value = String(raw ?? "");
        }
      }
    }
  }

  /** Re-label everything after a language change. */
  retranslate(): void {
    this.#capturingShortcut = null;
    this.#build();
    this.refresh();
  }

  #emit(key: SettingKey, value: SettingValue): void {
    this.onChange(key, value);
  }

  #normalizeHex(value: string, fallback: string): string {
    const raw = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toUpperCase();
    if (/^#[0-9a-f]{3}$/i.test(raw)) {
      const [r, g, b] = raw.slice(1).split("");
      return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
    }
    return fallback.toUpperCase();
  }

  #refreshColorControl(
    control: HTMLElement | null,
    value: unknown,
    fallback: string,
  ): void {
    if (!control) return;
    const color = control.querySelector<HTMLInputElement>('input[type="color"]');
    const text = control.querySelector<HTMLInputElement>('input[type="text"]');
    const hex = this.#normalizeHex(typeof value === "string" ? value : "", fallback);
    if (color) color.value = hex;
    if (text) text.value = hex;
  }

  #colorControl(
    key: SettingKey,
    defaultColor: string,
    showReset: boolean,
  ): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "settings-color";
    wrap.dataset.key = key;
    wrap.dataset.colorKey = key;

    const color = document.createElement("input");
    color.type = "color";
    const text = document.createElement("input");
    text.type = "text";
    text.placeholder = defaultColor;
    text.spellcheck = false;

    const commit = (raw: string, syncText: boolean) => {
      const hex = this.#normalizeHex(raw, defaultColor);
      color.value = hex;
      if (syncText) text.value = hex;
      this.#emit(key, hex);
    };

    color.addEventListener("input", () => commit(color.value, true));
    text.addEventListener("input", () => {
      if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(text.value.trim())) {
        commit(text.value, false);
      }
    });
    text.addEventListener("change", () => commit(text.value, true));

    wrap.append(color, text);
    if (showReset) {
      const reset = document.createElement("button");
      reset.type = "button";
      reset.className = "settings-color-clear";
      reset.textContent = t("settings.accent.clear");
      reset.addEventListener("click", () => commit(defaultColor, true));
      wrap.appendChild(reset);
    }
    return wrap;
  }

  #build(): void {
    this.#el.replaceChildren();

    const card = document.createElement("div");
    card.className = "settings-card";

    const head = document.createElement("div");
    head.className = "settings-head";
    const tabs = document.createElement("nav");
    tabs.className = "settings-tabs";
    const tabDefs: Array<[SettingsTab, I18nKey]> = [
      ["general", "settings.tab.general"],
      ["editor", "settings.tab.editor"],
      ["shortcuts", "settings.tab.shortcuts"],
      ["associations", "settings.tab.associations"],
      ["updates", "settings.tab.updates"],
    ];
    for (const [id, label] of tabDefs) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "settings-tab";
      button.classList.toggle("active", id === this.#activeTab);
      button.textContent = t(label);
      button.addEventListener("click", () => {
        if (this.#activeTab === id) return;
        this.#activeTab = id;
        this.#build();
        this.refresh();
      });
      tabs.appendChild(button);
    }
    const x = document.createElement("button");
    x.className = "settings-close";
    x.setAttribute("aria-label", t("about.close"));
    x.textContent = "×";
    x.addEventListener("click", () => this.close());
    head.append(tabs, x);
    card.appendChild(head);

    const content = document.createElement("div");
    content.className = "settings-content";
    card.appendChild(content);
    this.#el.appendChild(card);
    this.#renderActiveTab();
  }

  #renderActiveTab(): void {
    const content = this.#el.querySelector<HTMLElement>(".settings-content");
    if (!content) return;
    content.replaceChildren();

    if (this.#activeTab === "associations") {
      content.appendChild(this.#associationControls());
    }
    if (this.#activeTab === "updates") {
      content.appendChild(this.#updateControls());
    }

    for (const section of SECTIONS.filter((item) => item.tab === this.#activeTab)) {
      const fs = document.createElement("fieldset");
      const lg = document.createElement("legend");
      lg.textContent = t(section.title);
      fs.appendChild(lg);
      if (section.custom === "proxy") {
        fs.appendChild(this.#proxyControls());
      } else {
        for (const f of section.fields ?? []) fs.appendChild(this.#control(f));
      }
      content.appendChild(fs);
    }

    const foot = document.createElement("p");
    foot.className = "settings-foot";
    foot.textContent = `${t("settings.savedNote")}  ${t("settings.fileAt", {
      path: this.#path,
    })}`;
    content.appendChild(foot);
  }

  #associationControls(): HTMLElement {
    const wrap = document.createElement("section");
    wrap.className = "settings-associations";

    const toolbar = document.createElement("div");
    toolbar.className = "settings-association-toolbar";
    const left = document.createElement("div");
    const right = document.createElement("div");
    left.className = "settings-association-actions";
    right.className = "settings-association-actions";

    const makeButton = (label: I18nKey, handler: () => void | Promise<void>) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "settings-action";
      button.textContent = t(label);
      button.addEventListener("click", () => void handler());
      return button;
    };

    const all = makeButton("settings.associations.selectAll", () => {
      this.#emit("file_associations", allAssociationExtensions());
      this.#renderActiveTab();
    });
    const none = makeButton("settings.associations.selectNone", () => {
      this.#emit("file_associations", []);
      this.#renderActiveTab();
    });
    const register = makeButton("settings.associations.register", async () => {
      if (this.#associationBusy || !this.#associationAvailable || !this.#openWithCanModify) return;
      this.#associationBusy = true;
      this.#renderActiveTab();
      try {
        await this.onRegisterAssociations([...this.#get().file_associations]);
      } finally {
        this.#associationBusy = false;
        this.#renderActiveTab();
      }
    });
    const defaults = makeButton("settings.associations.setDefault", async () => {
      const selected = [...this.#get().file_associations];
      if (
        this.#associationBusy ||
        !this.#associationAvailable ||
        !this.#openWithCanModify ||
        selected.length === 0
      ) return;
      this.#associationBusy = true;
      this.#renderActiveTab();
      try {
        await this.onSetDefaultAssociations(selected);
      } finally {
        this.#associationBusy = false;
        this.#renderActiveTab();
      }
    });
    register.disabled =
      this.#associationBusy || !this.#associationAvailable || !this.#openWithCanModify;
    defaults.disabled =
      this.#associationBusy ||
      !this.#associationAvailable ||
      !this.#openWithCanModify ||
      this.#get().file_associations.length === 0;
    left.append(all, none);
    right.append(register, defaults);
    toolbar.append(left, right);
    wrap.appendChild(toolbar);

    const selected = new Set(this.#get().file_associations.map((ext) => ext.toLowerCase()));
    const categoryLabels: Record<FileCategoryId, I18nKey> = {
      markdown: "settings.associations.category.markdown",
      config: "settings.associations.category.config",
      web: "settings.associations.category.web",
      code: "settings.associations.category.code",
      text: "settings.associations.category.text",
    };

    for (const category of FILE_CATEGORY_ORDER) {
      const group = document.createElement("div");
      group.className = "settings-association-group";
      const title = document.createElement("h3");
      title.textContent = t(categoryLabels[category]);
      const grid = document.createElement("div");
      grid.className = "settings-association-grid";
      for (const ext of associationExtensionsByCategory(category)) {
        const item = document.createElement("label");
        item.className = "settings-association-item";
        item.classList.toggle("registered", this.#registeredExtensions.has(ext));
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = selected.has(ext);
        checkbox.addEventListener("change", () => {
          const current = new Set(this.#get().file_associations.map((item) => item.toLowerCase()));
          if (checkbox.checked) current.add(ext);
          else current.delete(ext);
          const ordered = allAssociationExtensions().filter((item) => current.has(item));
          this.#emit("file_associations", ordered);
        });
        const text = document.createElement("code");
        text.textContent = ext;
        item.append(checkbox, text);
        grid.appendChild(item);
      }
      group.append(title, grid);
      wrap.appendChild(group);
    }

    if (!this.#associationAvailable) {
      const note = document.createElement("p");
      note.className = "settings-association-note";
      note.textContent = t("settings.associations.windowsOnly");
      wrap.appendChild(note);
    } else if (!this.#openWithCanModify) {
      const note = document.createElement("p");
      note.className = "settings-association-note";
      note.textContent = t("settings.openWith.installed");
      wrap.appendChild(note);
    }
    return wrap;
  }

  #updateControls(): HTMLElement {
    const box = document.createElement("section");
    box.className = "settings-update-box";

    const versionRow = document.createElement("div");
    versionRow.className = "settings-row";
    const versionLabel = document.createElement("span");
    versionLabel.className = "settings-label";
    versionLabel.textContent = t("settings.currentVersion");
    const version = document.createElement("code");
    version.className = "settings-version";
    version.textContent = this.#appVersion ? `v${this.#appVersion}` : "—";
    versionRow.append(versionLabel, version);

    const actionRow = document.createElement("div");
    actionRow.className = "settings-row";
    const status = document.createElement("span");
    status.className = "settings-label settings-update-status";
    status.textContent = this.#updateStatus;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "settings-action";
    button.disabled = this.#updateBusy;
    button.textContent = this.#updateBusy ? t("update.checking") : t("update.check");
    button.addEventListener("click", async () => {
      if (this.#updateBusy) return;
      this.#updateBusy = true;
      this.#renderActiveTab();
      try {
        this.#updateStatus = await this.onCheckUpdates();
      } finally {
        this.#updateBusy = false;
        this.#renderActiveTab();
      }
    });
    actionRow.append(status, button);
    box.append(versionRow, actionRow);
    return box;
  }

  #proxyControls(): DocumentFragment {
    const fragment = document.createDocumentFragment();

    const statusRow = document.createElement("div");
    statusRow.className = "settings-row settings-row--proxy";
    const statusLabel = document.createElement("span");
    statusLabel.className = "settings-label";
    statusLabel.textContent = t("settings.proxy.status");
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "settings-action settings-proxy-toggle";
    toggle.dataset.proxyToggle = "true";
    toggle.addEventListener("click", () => {
      this.#emit("proxy_enabled", !this.#get().proxy_enabled);
      this.#proxyTestState = "idle";
      this.#proxyTestDetail = "";
      this.#refreshProxyControls();
    });
    statusRow.append(statusLabel, toggle);

    const addressRow = document.createElement("label");
    addressRow.className = "settings-row settings-row--proxy";
    const addressLabel = document.createElement("span");
    addressLabel.className = "settings-label";
    addressLabel.textContent = t("settings.proxy.address");
    const address = document.createElement("input");
    address.type = "text";
    address.spellcheck = false;
    address.className = "settings-proxy-address";
    address.dataset.key = "proxy_url";
    address.placeholder = "http://127.0.0.1:7897  /  socks5://127.0.0.1:7893";
    address.addEventListener("change", () => {
      this.#proxyTestState = "idle";
      this.#proxyTestDetail = "";
      this.#emit("proxy_url", address.value.trim());
      this.#refreshProxyControls();
    });
    addressRow.append(addressLabel, address);

    const testRow = document.createElement("div");
    testRow.className = "settings-row settings-row--proxy";
    const testLabel = document.createElement("span");
    testLabel.className = "settings-label";
    testLabel.textContent = t("settings.proxy.test");
    const testWrap = document.createElement("span");
    testWrap.className = "settings-proxy-test";
    const testButton = document.createElement("button");
    testButton.type = "button";
    testButton.className = "settings-action";
    testButton.dataset.proxyTest = "true";
    testButton.textContent = t("settings.proxy.testButton");
    testButton.addEventListener("click", async () => {
      if (this.#proxyTestBusy) return;
      const value =
        this.#el.querySelector<HTMLInputElement>('[data-key="proxy_url"]')?.value.trim() ??
        this.#get().proxy_url.trim();
      if (!value) {
        this.#proxyTestState = "error";
        this.#proxyTestDetail = t("settings.proxy.addressRequired");
        this.#refreshProxyControls();
        return;
      }
      this.#proxyTestBusy = true;
      this.#proxyTestState = "idle";
      this.#proxyTestDetail = "";
      this.#refreshProxyControls();
      try {
        await this.onProxyTest(value);
        this.#proxyTestState = "ok";
      } catch (err) {
        this.#proxyTestState = "error";
        this.#proxyTestDetail = String(err);
      } finally {
        this.#proxyTestBusy = false;
        this.#refreshProxyControls();
      }
    });
    const result = document.createElement("span");
    result.className = "settings-proxy-result";
    result.dataset.proxyResult = "true";
    testWrap.append(testButton, result);
    testRow.append(testLabel, testWrap);

    fragment.append(statusRow, addressRow, testRow);
    requestAnimationFrame(() => this.#refreshProxyControls());
    return fragment;
  }

  #refreshProxyControls(): void {
    const s = this.#get();
    const toggle = this.#el.querySelector<HTMLButtonElement>("[data-proxy-toggle]");
    if (toggle) {
      toggle.textContent = t(
        s.proxy_enabled ? "settings.proxy.enabled" : "settings.proxy.disabled",
      );
      toggle.classList.toggle("active", s.proxy_enabled);
      toggle.setAttribute("aria-pressed", String(s.proxy_enabled));
    }

    const address = this.#el.querySelector<HTMLInputElement>('[data-key="proxy_url"]');
    if (address && document.activeElement !== address) {
      address.value = s.proxy_url ?? "";
    }

    const button = this.#el.querySelector<HTMLButtonElement>("[data-proxy-test]");
    if (button) {
      button.disabled = this.#proxyTestBusy;
      button.textContent = this.#proxyTestBusy
        ? t("settings.proxy.testing")
        : t("settings.proxy.testButton");
    }

    const result = this.#el.querySelector<HTMLElement>("[data-proxy-result]");
    if (result) {
      result.classList.toggle("ok", this.#proxyTestState === "ok");
      result.classList.toggle("error", this.#proxyTestState === "error");
      result.textContent =
        this.#proxyTestState === "ok"
          ? t("settings.proxy.ok")
          : this.#proxyTestState === "error"
            ? t("settings.proxy.failed")
            : "";
      result.title = this.#proxyTestDetail;
    }
  }

  #control(f: Field): HTMLElement {
    const row = document.createElement(
      f.kind === "shortcut" || f.kind === "action" || f.kind === "checkboxColor"
        ? "div"
        : "label",
    );
    row.className = "settings-row settings-row--" + f.kind;

    const labelText = document.createElement("span");
    labelText.className = "settings-label";
    labelText.textContent = t(f.label);
    if (f.kind === "select" && f.hint) {
      const hint = document.createElement("span");
      hint.className = "settings-hint-text";
      hint.textContent = " — " + t(f.hint);
      labelText.appendChild(hint);
    }

    let control: HTMLElement;
    if (f.kind === "checkboxColor") {
      row.dataset.key = f.key;
      const left = document.createElement("label");
      left.className = "settings-checkbox-inline";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.dataset.key = f.key;
      cb.addEventListener("change", () => this.#emit(f.key, cb.checked));
      left.append(cb, labelText);
      const color = this.#colorControl(f.colorKey, f.defaultColor, false);
      row.append(left, color);
      return row;
    }

    if (f.kind === "checkbox") {
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.dataset.key = f.key;
      cb.addEventListener("change", () => this.#emit(f.key, cb.checked));
      control = cb;
      row.prepend(cb);
      row.append(labelText);
      return row;
    }

    row.append(labelText);

    if (f.kind === "action") {
      row.dataset.systemAction = f.action;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "settings-action";
      btn.addEventListener("click", async () => {
        if (this.#openWithBusy) return;
        this.setOpenWithBusy(true);
        try {
          await this.onOpenWithToggle();
        } finally {
          this.setOpenWithBusy(false);
        }
      });
      row.append(btn);
      this.#refreshOpenWithControl();
      return row;
    }

    if (f.kind === "shortcut") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "settings-shortcut";
      btn.dataset.shortcut = f.action;
      // Settings are loaded asynchronously after this panel is constructed;
      // `refresh()` fills the real binding once bootstrap has the payload.
      btn.textContent = "—";
      btn.addEventListener("click", () => {
        this.#capturingShortcut = f.action;
        this.#el.querySelectorAll<HTMLButtonElement>(".settings-shortcut").forEach((other) => {
          if (other !== btn) {
            other.classList.remove("listening", "conflict");
            const action = other.dataset.shortcut as ShortcutAction;
            other.textContent = formatShortcut(this.#get().shortcuts[action]);
            other.title = "";
          }
        });
        btn.classList.add("listening");
        btn.classList.remove("conflict");
        btn.textContent = t("settings.shortcut.capture");
        btn.title = t("settings.shortcut.cancelHint");
        btn.focus();
      });
      btn.addEventListener("keydown", (e) => {
        if (this.#capturingShortcut !== f.action) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "Escape" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
          this.#capturingShortcut = null;
          btn.classList.remove("listening", "conflict");
          btn.textContent = formatShortcut(this.#get().shortcuts[f.action]);
          btn.title = "";
          return;
        }
        const binding = shortcutFromEvent(e);
        if (!binding) return;
        const duplicate = Object.entries(this.#get().shortcuts).find(
          ([action, value]) => action !== f.action && value === binding,
        );
        if (duplicate) {
          btn.classList.add("conflict");
          btn.textContent = t("settings.shortcut.conflict");
          window.setTimeout(() => {
            if (this.#capturingShortcut === f.action) {
              btn.classList.remove("conflict");
              btn.textContent = t("settings.shortcut.capture");
            }
          }, 900);
          return;
        }
        this.#capturingShortcut = null;
        btn.classList.remove("listening", "conflict");
        btn.textContent = formatShortcut(binding);
        btn.title = "";
        this.onShortcutChange(f.action, binding);
      });
      row.append(btn);
      return row;
    }

    if (f.kind === "select") {
      const sel = document.createElement("select");
      sel.dataset.key = f.key;
      for (const o of f.options) {
        const opt = document.createElement("option");
        opt.value = o.value;
        // list_marker options show the literal marker, not a translated label
        opt.textContent = f.key === "list_marker" ? o.value : t(o.label);
        sel.appendChild(opt);
      }
      sel.addEventListener("change", () => this.#emit(f.key, sel.value));
      control = sel;
    } else if (f.kind === "number") {
      const inp = document.createElement("input");
      inp.type = "number";
      inp.min = String(f.min);
      inp.max = String(f.max);
      inp.dataset.key = f.key;
      inp.addEventListener("change", () => {
        const n = Math.max(f.min, Math.min(f.max, Number(inp.value) || f.min));
        inp.value = String(n);
        this.#emit(f.key, n);
      });
      control = inp;
    } else if (f.kind === "color") {
      control = this.#colorControl(f.key, f.defaultColor ?? "#39C5BB", true);
    } else {
      const inp = document.createElement("input");
      inp.type = "text";
      inp.spellcheck = false;
      if (f.placeholder) inp.placeholder = t(f.placeholder);
      inp.dataset.key = f.key;
      inp.addEventListener("change", () => this.#emit(f.key, inp.value.trim()));
      control = inp;
    }

    row.append(control);
    return row;
  }
}
