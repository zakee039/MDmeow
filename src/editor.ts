// Thin wrapper around Milkdown Crepe: one editor instance, documents are
// swapped in place (tabbed editing keeps a single instance — see tabs.ts).
import { invoke } from "@tauri-apps/api/core";
import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import { replaceAll } from "@milkdown/kit/utils";
import { editorViewCtx } from "@milkdown/kit/core";
import type { EditorView } from "@milkdown/kit/prose/view";

import { linkFromClipboard } from "./link-clipboard";
import {
  installBlockMenu,
  runBlockAction,
  type BlockActionId,
  type BlockMenuHandle,
} from "./block-menu";
import { emojiInputRule } from "./emoji";
import { t } from "./i18n";
import {
  configureMarkdownSerializer,
  type ListMarker,
} from "./markdown-serializer";
import { patchImageBlockMarkdown } from "./image-block-markdown";
import { patchHtmlMarkdown, resolveRawHtmlImages } from "./html-markdown";
import { mikuCreamCodeMirrorTheme } from "./miku-cream";
import {
  findKey,
  findPlugin,
  statusOf,
  activeMatch,
  allMatches,
  type FindStatus,
} from "./find";

export class Editor {
  private crepe: Crepe | null = null;
  private blockMenu: BlockMenuHandle | null = null;
  private readonly host: HTMLElement;
  private lineNumberFrame: number | null = null;
  private readonly codeLineObserver: MutationObserver;
  private readonly copyFeedbackTimers = new WeakMap<
    HTMLButtonElement,
    [number, number]
  >();
  private listMarker: ListMarker = "*";
  /** Path of the document in the active tab — the base for relative images. */
  private docPath: string | null = null;
  /** Resolved `data:` URLs, keyed by `docPath \0 src`. */
  private readonly imageCache = new Map<string, string>();

  /** Fires on every content change. */
  onChange: () => void = () => {};

  constructor(host: HTMLElement) {
    this.host = host;
    this.host.addEventListener("click", this.handleCodeToolClick);
    this.codeLineObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const target =
          mutation.target instanceof Element
            ? mutation.target
            : mutation.target.parentElement;
        if (target?.closest(".mowl-code-line-numbers")) continue;

        if (target?.closest(".milkdown-code-block")) {
          this.scheduleExternalCodeLineNumbers();
          return;
        }

        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (
            node.matches(".milkdown-code-block, .cm-content, .cm-line") ||
            node.querySelector(".milkdown-code-block, .cm-content, .cm-line")
          ) {
            this.scheduleExternalCodeLineNumbers();
            return;
          }
        }
      }
    });
    this.codeLineObserver.observe(this.host, {
      childList: true,
      subtree: true,
    });
  }

  private scheduleExternalCodeLineNumbers(): void {
    if (this.lineNumberFrame !== null) {
      window.cancelAnimationFrame(this.lineNumberFrame);
    }
    this.lineNumberFrame = window.requestAnimationFrame(() => {
      this.lineNumberFrame = null;
      this.renderExternalCodeLineNumbers();
    });
  }

  private renderExternalCodeLineNumbers(): void {
    for (const block of this.host.querySelectorAll<HTMLElement>(
      ".milkdown-code-block",
    )) {
      const content = block.querySelector<HTMLElement>(".cm-content");
      const lines = content?.querySelectorAll<HTMLElement>(".cm-line");
      if (!content || !lines?.length) {
        block.querySelector(":scope > .mowl-code-line-numbers")?.remove();
        continue;
      }

      let rail = block.querySelector<HTMLElement>(
        ":scope > .mowl-code-line-numbers",
      );
      if (!rail) {
        rail = document.createElement("div");
        rail.className = "mowl-code-line-numbers";
        rail.setAttribute("aria-hidden", "true");
        block.appendChild(rail);
      }

      const blockRect = block.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      rail.style.top = `${contentRect.top - blockRect.top}px`;
      rail.style.height = `${contentRect.height}px`;

      const fragment = document.createDocumentFragment();
      lines.forEach((line, index) => {
        const lineRect = line.getBoundingClientRect();
        const number = document.createElement("span");
        number.textContent = String(index + 1);
        number.style.top = `${lineRect.top - contentRect.top}px`;
        number.style.height = `${lineRect.height}px`;
        number.style.lineHeight = `${lineRect.height}px`;
        fragment.appendChild(number);
      });
      rail.replaceChildren(fragment);
    }
  }

  private handleCodeToolClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const button = target.closest<HTMLButtonElement>(
      ".milkdown-code-block .tools-button-group button",
    );
    if (!button) return;

    const previous = this.copyFeedbackTimers.get(button);
    if (previous) {
      window.clearTimeout(previous[0]);
      window.clearTimeout(previous[1]);
    }

    button.classList.remove("mowl-copy-returning");
    button.classList.add("mowl-copy-success");

    const returnTimer = window.setTimeout(() => {
      button.classList.add("mowl-copy-returning");
    }, 620);
    const resetTimer = window.setTimeout(() => {
      button.classList.remove("mowl-copy-success", "mowl-copy-returning");
      this.copyFeedbackTimers.delete(button);
    }, 900);

    this.copyFeedbackTimers.set(button, [returnTimer, resetTimer]);
  };

  /** Bullet-list marker written on save. Applied on the next `init()`. */
  setListMarker(marker: ListMarker): void {
    this.listMarker = marker;
  }

  /** Tell the editor which file is being edited, so relative image paths
   *  (`![](pic.png)`, `![](../assets/pic.png)`) resolve against its folder. */
  setDocPath(path: string | null): void {
    this.docPath = path;
  }

  /** `proxyDomURL` hook: map a Markdown image target to something the WebView
   *  can actually display. Remote / data URLs pass through; local paths are
   *  read by the backend and returned as a `data:` URL. */
  private resolveImageSrc = (src: string): string | Promise<string> => {
    const raw = (src ?? "").trim();
    if (
      !raw ||
      raw.startsWith("#") ||
      raw.startsWith("//") ||
      /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ||
      /^(data|blob):/i.test(raw)
    ) {
      return src;
    }
    const key = `${this.docPath ?? ""}\u0000${raw}`;
    const cached = this.imageCache.get(key);
    if (cached) return cached;
    return invoke<string>("read_image_data_url", { docPath: this.docPath, src: raw })
      .then((url) => {
        this.imageCache.set(key, url);
        return url;
      })
      .catch(() => src);
  };

  /** Create the underlying Crepe instance once. */
  async init(markdown: string): Promise<void> {
    await this.destroy();
    const crepe = new Crepe({
      root: this.host,
      // Content is loaded via `setContent` below, once the image-block Markdown
      // runners are patched — `defaultValue` would be parsed with Crepe's own
      // lossy image handling (see image-block-markdown.ts).
      defaultValue: "",
      featureConfigs: {
        [Crepe.Feature.CodeMirror]: { theme: mikuCreamCodeMirrorTheme },
        [Crepe.Feature.ImageBlock]: { proxyDomURL: this.resolveImageSrc },
        [Crepe.Feature.Placeholder]: { text: t("editor.placeholder") },
      },
    });
    const marker = this.listMarker;
    crepe.editor
      .config((ctx) => configureMarkdownSerializer(ctx, marker))
      .use(linkFromClipboard)
      .use(findPlugin)
      .use(emojiInputRule);
    crepe.on((listener) => {
      listener.markdownUpdated(() => {
        this.onChange();
        this.scheduleExternalCodeLineNumbers();
      });
    });
    await crepe.create();
    this.crepe = crepe;
    patchImageBlockMarkdown(crepe);
    patchHtmlMarkdown(crepe);
    this.blockMenu = installBlockMenu(crepe);
    if (markdown) this.setContent(markdown);
    else this.scheduleExternalCodeLineNumbers();
  }

  /** Rebuild the instance in place, keeping the current content. */
  async reload(): Promise<void> {
    if (!this.crepe) return;
    await this.init(this.getMarkdown());
  }

  /** Replace the whole document without tearing the instance down. */
  setContent(markdown: string): void {
    this.crepe?.editor.action(replaceAll(markdown, true));
    resolveRawHtmlImages(this.host, this.resolveImageSrc);
    this.scheduleExternalCodeLineNumbers();
  }

  getMarkdown(): string {
    return this.crepe?.getMarkdown() ?? "";
  }

  setSpellcheck(on: boolean): void {
    this.host
      .querySelector(".ProseMirror")
      ?.setAttribute("spellcheck", String(on));
  }

  setDirection(dir: "ltr" | "rtl"): void {
    this.host.querySelector(".ProseMirror")?.setAttribute("dir", dir);
    (this.host.querySelector(".milkdown") as HTMLElement | null)?.setAttribute(
      "dir",
      dir,
    );
  }

  focus(): void {
    (this.host.querySelector(".ProseMirror") as HTMLElement | null)?.focus();
  }

  /** Turn the block(s) touched by the selection into `id`'s type — the same
   *  conversion as the matching ⠿ menu entry (see block-menu.ts). */
  runBlockAction(id: BlockActionId): void {
    if (this.crepe) runBlockAction(this.crepe, id);
  }

  /** Re-label UI after a language change (block menu; placeholder waits for a
   *  reload — it is only visible on an empty document). */
  retranslate(): void {
    this.blockMenu?.retranslate();
  }

  /** Insert plain text at the cursor (used for emoji). */
  insertText(text: string): void {
    const view = this.view();
    if (!view) return;
    view.dispatch(view.state.tr.insertText(text));
    view.focus();
  }

  /** Viewport rectangle of the caret, for anchoring popups. */
  caretRect(): DOMRect | null {
    const view = this.view();
    if (!view) return null;
    try {
      const c = view.coordsAtPos(view.state.selection.head);
      return new DOMRect(c.left, c.top, c.right - c.left, c.bottom - c.top);
    } catch {
      return null;
    }
  }

  // --- find / replace ----------------------------------------------------

  private view(): EditorView | null {
    return this.crepe?.editor.action((ctx) => ctx.get(editorViewCtx)) ?? null;
  }

  private status(): FindStatus {
    const view = this.view();
    return statusOf(view ? findKey.getState(view.state) : null);
  }

  private scrollToActive(): void {
    const view = this.view();
    if (!view) return;
    const m = activeMatch(findKey.getState(view.state));
    if (!m) return;
    const at = view.domAtPos(m.from);
    const el =
      at.node.nodeType === 1
        ? (at.node as HTMLElement)
        : at.node.parentElement;
    el?.scrollIntoView({ block: "center", inline: "nearest" });
  }

  /** Selected text, for pre-filling the find box. */
  selectionText(): string {
    const view = this.view();
    if (!view) return "";
    const { from, to } = view.state.selection;
    return from === to ? "" : view.state.doc.textBetween(from, to, " ");
  }

  findSet(query: string, caseSensitive: boolean): FindStatus {
    const view = this.view();
    if (!view) return { count: 0, index: 0 };
    view.dispatch(
      view.state.tr.setMeta(findKey, { query, caseSensitive, active: 0 }),
    );
    this.scrollToActive();
    return this.status();
  }

  findStep(dir: 1 | -1): FindStatus {
    const view = this.view();
    if (!view) return { count: 0, index: 0 };
    view.dispatch(view.state.tr.setMeta(findKey, { step: dir }));
    this.scrollToActive();
    return this.status();
  }

  findClear(): void {
    const view = this.view();
    view?.dispatch(view.state.tr.setMeta(findKey, { query: "" }));
  }

  findReplace(replacement: string): FindStatus {
    const view = this.view();
    if (!view) return { count: 0, index: 0 };
    const m = activeMatch(findKey.getState(view.state));
    if (!m) return this.status();
    const tr = view.state.tr;
    if (replacement) tr.insertText(replacement, m.from, m.to);
    else tr.delete(m.from, m.to);
    // Keep the same ordinal so the selection lands on the following match.
    tr.setMeta(findKey, { active: findKey.getState(view.state)?.active ?? 0 });
    view.dispatch(tr);
    this.scrollToActive();
    return this.status();
  }

  findReplaceAll(replacement: string): FindStatus {
    const view = this.view();
    if (!view) return { count: 0, index: 0 };
    const matches = allMatches(findKey.getState(view.state));
    if (!matches.length) return { count: 0, index: 0 };
    const tr = view.state.tr;
    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i];
      if (replacement) tr.insertText(replacement, m.from, m.to);
      else tr.delete(m.from, m.to);
    }
    tr.setMeta(findKey, { active: 0 });
    view.dispatch(tr);
    return this.status();
  }

  async destroy(): Promise<void> {
    if (this.lineNumberFrame !== null) {
      window.cancelAnimationFrame(this.lineNumberFrame);
      this.lineNumberFrame = null;
    }
    this.blockMenu?.dispose();
    this.blockMenu = null;
    if (this.crepe) {
      await this.crepe.destroy();
      this.crepe = null;
    }
    this.host.replaceChildren();
  }
}
