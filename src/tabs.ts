// Tab model + tab-strip rendering. One open document per tab; the heavy editor
// instance is shared (main.ts swaps content on activation). Inactive tabs cost
// only their text.

import { t } from "./i18n";

export interface Tab {
  id: string;
  path: string | null;
  /** Content as last saved or loaded. */
  saved: string;
  /** Current editor content for this tab. */
  content: string;
  dirty: boolean;
  scrollTop: number;
}

let seq = 0;
const nextId = () => `t${++seq}`;

export function baseName(path: string | null): string {
  if (!path) return t("doc.untitled");
  const parts = path.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts[parts.length - 1] || t("doc.untitled");
}

export class TabBar {
  tabs: Tab[] = [];
  activeId = "";
  /** Keep the strip visible even with a single tab (settings-driven). */
  private alwaysShow = false;

  /** Called after the active tab changes; `prev` is the tab we left (if any). */
  onActivate: (next: Tab, prev: Tab | null) => void = () => {};
  /** Called when the set of tabs or their identity changes (persist trigger). */
  onStructureChange: () => void = () => {};
  /** Called when the user asks to close a tab; main.ts decides (dirty guard). */
  onCloseRequest: (tab: Tab) => void = () => {};

  private readonly el: HTMLElement;

  constructor(el: HTMLElement) {
    this.el = el;
    this.el.addEventListener("click", (e) => this.handleClick(e));
    this.el.addEventListener("auxclick", (e) => {
      if ((e as MouseEvent).button === 1) this.handleClick(e); // middle-click closes
    });
  }

  get active(): Tab | undefined {
    return this.tabs.find((t) => t.id === this.activeId);
  }

  /** Show the strip with a single tab, or hide it (the default). */
  setAlwaysShow(on: boolean): void {
    if (this.alwaysShow === on) return;
    this.alwaysShow = on;
    this.render();
  }

  findByPath(path: string): Tab | undefined {
    return this.tabs.find((t) => t.path === path);
  }

  add(
    path: string | null,
    content: string,
    activate = true,
  ): Tab {
    const tab: Tab = {
      id: nextId(),
      path,
      saved: content,
      content,
      dirty: false,
      scrollTop: 0,
    };
    this.tabs.push(tab);
    this.onStructureChange();
    if (activate) this.activate(tab.id);
    else this.render();
    return tab;
  }

  activate(id: string): void {
    if (id === this.activeId) return;
    const prev = this.active ?? null;
    const next = this.tabs.find((t) => t.id === id);
    if (!next) return;
    this.activeId = id;
    this.onActivate(next, prev);
    this.render();
  }

  /** Remove a tab unconditionally (dirty check happens in main.ts). */
  remove(id: string): void {
    const idx = this.tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const wasActive = this.activeId === id;
    this.tabs.splice(idx, 1);
    this.onStructureChange();
    if (this.tabs.length === 0) {
      this.add(null, "");
      return;
    }
    if (wasActive) {
      const neighbour = this.tabs[Math.min(idx, this.tabs.length - 1)];
      this.activeId = "";
      this.activate(neighbour.id);
    } else {
      this.render();
    }
  }

  /** Cheap update of the dirty dots without rebuilding the strip. */
  refreshDirty(): void {
    for (const tab of this.tabs) {
      const node = this.el.querySelector<HTMLElement>(`[data-tab="${tab.id}"]`);
      node?.classList.toggle("dirty", tab.dirty);
      const label = node?.querySelector(".tab-name");
      if (label) label.textContent = baseName(tab.path);
    }
  }

  render(): void {
    this.el.hidden = !this.alwaysShow && this.tabs.length <= 1;
    this.el.replaceChildren();

    for (const tab of this.tabs) {
      const item = document.createElement("div");
      item.className = "tab" + (tab.id === this.activeId ? " active" : "");
      item.classList.toggle("dirty", tab.dirty);
      item.dataset.tab = tab.id;
      item.title = tab.path ?? t("doc.untitled");

      const name = document.createElement("span");
      name.className = "tab-name";
      name.textContent = baseName(tab.path);

      const close = document.createElement("button");
      close.className = "tab-close";
      close.dataset.close = tab.id;
      close.setAttribute("aria-label", t("tab.close"));
      close.textContent = "×";

      item.append(name, close);
      this.el.appendChild(item);
    }

    const add = document.createElement("button");
    add.id = "tab-add";
    add.setAttribute("aria-label", t("tab.new"));
    add.textContent = "+";
    this.el.appendChild(add);
  }

  private handleClick(e: Event): void {
    const target = e.target as HTMLElement;

    if (target.closest("#tab-add")) {
      this.add(null, "");
      return;
    }

    const closeId = target.closest<HTMLElement>("[data-close]")?.dataset.close;
    if (closeId) {
      e.preventDefault();
      const tab = this.tabs.find((t) => t.id === closeId);
      if (tab) this.onCloseRequest(tab);
      return;
    }

    const tabId = target.closest<HTMLElement>("[data-tab]")?.dataset.tab;
    if (!tabId) return;
    if ((e as MouseEvent).button === 1) {
      e.preventDefault();
      const tab = this.tabs.find((t) => t.id === tabId);
      if (tab) this.onCloseRequest(tab);
    } else {
      this.activate(tabId);
    }
  }
}
