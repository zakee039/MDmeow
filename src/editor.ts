// Thin wrapper around Milkdown Crepe: one editor instance, documents are
// swapped in place (tabbed editing keeps a single instance — see tabs.ts).
import { invoke } from "@tauri-apps/api/core";
import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import { replaceAll, $prose } from "@milkdown/kit/utils";
import { editorViewCtx, keymapCtx, remarkCtx } from "@milkdown/kit/core";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import { matchingPositions, type CursorAnchor } from "./cursor-position";
import { Plugin } from "@milkdown/kit/prose/state";
import { Prec } from "@codemirror/state";
import { keymap as codeMirrorKeymap } from "@codemirror/view";

import { linkFromClipboard } from "./link-clipboard";
import { configurePlainParagraph, insertPlainParagraph } from "./plain-paragraph";
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
import { imageToolbarPlugin } from "./image-toolbar";
import {
  patchHtmlMarkdown,
  refreshSafeRawHtml,
  resolveRawHtmlImages,
  safeHtmlPresentationPlugin,
} from "./html-markdown";
import { mikuCreamCodeMirrorTheme } from "./miku-cream";
import {
  candidateParagraphs,
  findKnownUnsafeFragments,
  makeProtectionToken,
  maskFragments,
  restoreProtectedFragments,
  protectionTokenCount,
} from "./partial-markdown";
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
  private proxyEnabled = false;
  private proxyUrl = "";
  /** Resolved `data:` URLs, keyed by `docPath \0 src`. */
  private readonly imageCache = new Map<string, string>();
  private protectedTokens = new Set<string>();
  private programmaticDocumentUpdate = false;
  private protectedCount = 0;
  /** A UTF-8 BOM belongs to the original source, not the Markdown parser.
   * Milkdown mishandles it in long documents and may corrupt unrelated bold
   * spans; restore the BOM whenever the source is read or saved. */
  private leadingBOM = "";
  /** The last actual document state reported as an edit. Milkdown's
   * markdownUpdated is debounced and may fire long after setContent(), even
   * when no user-facing document transaction occurred. */
  private lastNotifiedDoc: ProseNode | null = null;
  private lastNotifiedMarkdown: string | null = null;

  private notifyActualEdit(): void {
    if (this.programmaticDocumentUpdate || !this.crepe) return;
    const doc = this.crepe.editor.ctx.get(editorViewCtx).state.doc;
    const markdown = this.getMarkdown();
    if (this.lastNotifiedDoc?.eq(doc) && this.lastNotifiedMarkdown === markdown) {
      return;
    }
    this.lastNotifiedDoc = doc;
    this.lastNotifiedMarkdown = markdown;
    this.onChange();
  }

  private captureDocumentBaseline(): void {
    if (!this.crepe) return;
    this.lastNotifiedDoc = this.crepe.editor.ctx.get(editorViewCtx).state.doc;
    this.lastNotifiedMarkdown = this.getMarkdown();
  }

  /** Fires on every content change. */
  onChange: () => void = () => {};
  /** Fires whenever the ProseMirror selection changes. */
  onSelectionChange: () => void = () => {};

  constructor(host: HTMLElement) {
    this.host = host;
    this.host.addEventListener("click", this.handleCodeToolClick);
    this.host.addEventListener("click", this.handleLatexPreviewClick);
    this.codeLineObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const target =
          mutation.target instanceof Element
            ? mutation.target
            : mutation.target.parentElement;
        if (target?.closest(".mdmeow-code-line-numbers")) continue;

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
      const previewOnlyLatex =
        block.querySelector(".preview-panel .katex-display") &&
        block.querySelector(".codemirror-host.hidden");
      if (previewOnlyLatex) {
        block.querySelector(":scope > .mdmeow-code-line-numbers")?.remove();
        continue;
      }

      const content = block.querySelector<HTMLElement>(".cm-content");
      const lines = content?.querySelectorAll<HTMLElement>(".cm-line");
      if (!content || !lines?.length) {
        block.querySelector(":scope > .mdmeow-code-line-numbers")?.remove();
        continue;
      }

      let rail = block.querySelector<HTMLElement>(
        ":scope > .mdmeow-code-line-numbers",
      );
      if (!rail) {
        rail = document.createElement("div");
        rail.className = "mdmeow-code-line-numbers";
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
      ".milkdown-code-block .tools-button-group .copy-button",
    );
    if (!button) return;

    const previous = this.copyFeedbackTimers.get(button);
    if (previous) {
      window.clearTimeout(previous[0]);
      window.clearTimeout(previous[1]);
    }

    button.classList.remove("mdmeow-copy-returning");
    button.classList.add("mdmeow-copy-success");

    const returnTimer = window.setTimeout(() => {
      button.classList.add("mdmeow-copy-returning");
    }, 620);
    const resetTimer = window.setTimeout(() => {
      button.classList.remove("mdmeow-copy-success", "mdmeow-copy-returning");
      this.copyFeedbackTimers.delete(button);
    }, 900);

    this.copyFeedbackTimers.set(button, [returnTimer, resetTimer]);
  };

  private handleLatexPreviewClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const clickedBlock = target.closest<HTMLElement>(".milkdown-code-block");

    // A block LaTeX preview behaves like a rendered formula by default.
    // Clicking the formula opens the source editor; clicking elsewhere folds
    // any open formula back to preview-only mode.
    for (const block of this.host.querySelectorAll<HTMLElement>(
      ".milkdown-code-block:has(.preview-panel .katex-display)",
    )) {
      const codeHost = block.querySelector<HTMLElement>(".codemirror-host");
      const toggle = block.querySelector<HTMLButtonElement>(
        ".preview-toggle-button",
      );
      if (!codeHost || !toggle) continue;

      const editing = !codeHost.classList.contains("hidden");
      if (editing && block !== clickedBlock) toggle.click();
    }

    if (!clickedBlock) return;
    const preview = target.closest<HTMLElement>(
      ".preview-panel .katex-display, .preview-panel .katex",
    );
    if (!preview) return;

    const codeHost = clickedBlock.querySelector<HTMLElement>(".codemirror-host");
    const toggle = clickedBlock.querySelector<HTMLButtonElement>(
      ".preview-toggle-button",
    );
    if (!codeHost?.classList.contains("hidden") || !toggle) return;

    event.preventDefault();
    toggle.click();
    requestAnimationFrame(() => {
      clickedBlock.querySelector<HTMLElement>(".cm-content")?.focus();
      this.scheduleExternalCodeLineNumbers();
    });
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

  setProxyConfig(enabled: boolean, url: string): void {
    const nextUrl = url.trim();
    if (this.proxyEnabled === enabled && this.proxyUrl === nextUrl) return;
    this.proxyEnabled = enabled;
    this.proxyUrl = nextUrl;
    this.imageCache.clear();
  }

  /** `proxyDomURL` hook: map a Markdown image target to something the WebView
   *  can actually display. Remote / data URLs pass through; local paths are
   *  read by the backend and returned as a `data:` URL. */
  private resolveImageSrc = (src: string): string | Promise<string> => {
    const raw = (src ?? "").trim();
    const remote = raw.startsWith("//") ? `https:${raw}` : raw;
    if (/^https?:\/\//i.test(remote)) {
      if (!this.proxyEnabled) return src;
      const key = `proxy\u0000${this.proxyUrl}\u0000${remote}`;
      const cached = this.imageCache.get(key);
      if (cached) return cached;
      return invoke<string>("fetch_remote_image_data_url", {
        src: remote,
        proxyUrl: this.proxyUrl,
      })
        .then((url) => {
          this.imageCache.set(key, url);
          return url;
        })
        .catch(() =>
          "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='120' viewBox='0 0 240 120'%3E%3Crect width='240' height='120' rx='12' fill='%23f3f1ee'/%3E%3Cpath d='M96 42l48 36M144 42L96 78' stroke='%23b8b2aa' stroke-width='4' stroke-linecap='round'/%3E%3C/svg%3E",
        );
    }
    if (
      !raw ||
      raw.startsWith("#") ||
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
        [Crepe.Feature.CodeMirror]: {
          theme: mikuCreamCodeMirrorTheme,
          // The configurable app command owns this key. Suppress Crepe's
          // fixed exitCode binding even when the user reassigns that command.
          extensions: [
            Prec.highest(
              codeMirrorKeymap.of([{ key: "Mod-Enter", run: () => true }]),
            ),
          ],
          // Preview-capable blocks (currently LaTeX) render as their result by
          // default. Ordinary code blocks have no preview and stay editable.
          previewOnlyByDefault: true,
        },
        [Crepe.Feature.ImageBlock]: { proxyDomURL: this.resolveImageSrc },
        [Crepe.Feature.Placeholder]: { text: t("editor.placeholder") },
      },
    });
    const marker = this.listMarker;
    crepe.editor
      .config((ctx) => configureMarkdownSerializer(ctx, marker))
      .config(configurePlainParagraph)
      .config((ctx) => {
        // ProseMirror's base keymap also supplies the old fixed exitCode key.
        ctx.get(keymapCtx).add({
          key: "Mod-Enter",
          priority: 1000,
          onRun: () => () => true,
        });
      })
      .use(linkFromClipboard)
      .use(findPlugin)
      .use(imageToolbarPlugin)
      .use(safeHtmlPresentationPlugin)
      .use($prose(() => new Plugin({
        view: () => ({
          // Document transactions are observed immediately, not after
          // Milkdown's delayed markdownUpdated notification. This also
          // snapshots unsaved edits before a fast tab switch.
          update: (view, previous) => {
            if (!previous.doc.eq(view.state.doc)) this.notifyActualEdit();
          },
        }),
        filterTransaction: (tr) => {
          if (!tr.docChanged || this.programmaticDocumentUpdate ||
              this.protectedTokens.size === 0) return true;
          const present = new Set<string>();
          tr.doc.descendants((node) => {
            if (node.type.name === "html") present.add(String(node.attrs?.value ?? "").trim());
          });
          // A protected error placeholder cannot be accidentally deleted while
          // typing/editing other paragraphs: deleting it would lose raw source.
          return [...this.protectedTokens].every((token) => present.has(token));
        },
      })))
      .use(emojiInputRule);
    crepe.on((listener) => {
      listener.markdownUpdated(() => {
        // Also captures nested editors, without counting delayed initial loads.
        this.notifyActualEdit();
        this.scheduleExternalCodeLineNumbers();
        refreshSafeRawHtml(this.host);
      });
      listener.selectionUpdated(() => {
        this.onSelectionChange();
      });
    });
    await crepe.create();
    this.crepe = crepe;
    patchImageBlockMarkdown(crepe);
    patchHtmlMarkdown(crepe);
    this.blockMenu = installBlockMenu(crepe);
    if (markdown) this.setContent(markdown);
    else {
      this.captureDocumentBaseline();
      this.scheduleExternalCodeLineNumbers();
    }
  }

  /** Rebuild the instance in place, keeping the current content. */
  async reload(): Promise<void> {
    if (!this.crepe) return;
    await this.init(this.getMarkdown());
  }

  /** Load Markdown into WYSIWYG, hiding only the spans that cannot be
   * safely parsed. Protected spans are encoded in atomic HTML nodes and
   * restored verbatim whenever Markdown is read or saved. */
  setContent(markdown: string): void {
    if (!this.crepe) return;
    // BOM is a file encoding marker, not Markdown syntax. Hide it during
    // parsing so Crepe cannot alter unrelated bold text, but restore it
    // when reading the Markdown for editing or saving.
    this.leadingBOM = markdown.startsWith("\uFEFF") ? "\uFEFF" : "";
    if (this.leadingBOM) markdown = markdown.slice(1);
    this.programmaticDocumentUpdate = true;
    try {
      const load = (content: string) => this.crepe!.editor.action(replaceAll(content, true));
      let prepared = maskFragments(markdown, findKnownUnsafeFragments(markdown));
      const check = (content: string): boolean => {
        try {
          load(content);
          return this.isSafeToRender(content);
        } catch {
          return false;
        }
      };

      if (!check(prepared)) {
        // Unknown syntax: probe independent paragraphs first, preserving the
        // ones that Milkdown understands, rather than hiding the entire file.
        const unsafe = [];
        for (const section of candidateParagraphs(prepared).slice(0, 100)) {
          const fragment = prepared.slice(section.start, section.end);
          if (!check(fragment)) unsafe.push(section);
        }
        if (unsafe.length) prepared = maskFragments(prepared, unsafe);
        if (!check(prepared)) {
          const sections = candidateParagraphs(prepared).slice(0, 100);
          for (let i = sections.length - 1; i >= 0; i--) {
            const next = maskFragments(prepared, [sections[i]]);
            if (check(next)) { prepared = next; break; }
          }
          // If there is an interaction the paragraph probes cannot localize,
          // use a protected placeholder for it rather than losing any source.
          if (!check(prepared)) prepared = makeProtectionToken(markdown);
        }
      }
      this.protectedTokens = new Set(
        [...prepared.matchAll(/<mdmeow-parse-error data-raw="[A-Za-z0-9+/=]+"\s*\/>/g)]
          .map((match) => match[0]),
      );
      this.protectedCount = protectionTokenCount(prepared);
      load(prepared);
    } finally {
      // Loading the source is not a user edit. Capture its rendered ProseMirror
      // state and Markdown now, before a debounced markdownUpdated fires.
      this.captureDocumentBaseline();
      this.programmaticDocumentUpdate = false;
    }
    resolveRawHtmlImages(this.host, this.resolveImageSrc);
    refreshSafeRawHtml(this.host);
    this.scheduleExternalCodeLineNumbers();
  }

  getMarkdown(): string {
    return this.leadingBOM + restoreProtectedFragments(this.crepe?.getMarkdown() ?? "");
  }

  get protectedFragmentCount(): number {
    return this.protectedCount;
  }

  /** Allow only semantic-preserving Markdown normalization in WYSIWYG.
   * The original bytes remain the tab's saved baseline until an explicit edit.
   * Unknown/lost nodes and front matter always fall back to source mode. */
  isSafeToRender(source: string): boolean {
    const serialized = this.crepe?.getMarkdown() ?? "";
    if (serialized === source) return true;
    // Front matter can look like thematic breaks to a GFM-only parser;
    // the two ASTs may match even when the YAML header has been damaged.
    if (/^\uFEFF?---[ \t]*\r?\n/.test(source)) return false;
    if (!this.crepe) return false;
    try {
      const processor = this.crepe.editor.ctx.get(remarkCtx);
      const normalize = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(normalize);
        if (value && typeof value === "object") {
          return Object.fromEntries(
            Object.entries(value).filter(([key]) => key !== "position" && key !== "data")
              .map(([key, item]) => [key, normalize(item)]),
          );
        }
        return value;
      };
      return JSON.stringify(normalize(processor.parse(source))) ===
        JSON.stringify(normalize(processor.parse(serialized)));
    } catch {
      return false;
    }
  }

  setSpellcheck(on: boolean): void {
    this.host
      .querySelector(".ProseMirror")
      ?.setAttribute("spellcheck", String(on));
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

  /** Start a top-level, unformatted paragraph at the cursor. */
  insertPlainParagraph(): boolean {
    const view = this.view();
    return view ? insertPlainParagraph(view) : false;
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

  /** Text near the visible caret, used as a stable anchor when switching
   * between WYSIWYG and Markdown source (offsets differ around formatting). */
  cursorAnchor(): CursorAnchor | null {
    const view = this.view();
    if (!view) return null;
    const head = view.state.selection.head;
    let coords: { top: number };
    try { coords = view.coordsAtPos(head); } catch { return null; }
    const rect = this.host.getBoundingClientRect();
    if (rect.height < 1 || coords.top < rect.top || coords.top > rect.bottom) return null;
    const $head = view.state.doc.resolve(head);
    if (!$head.parent.isTextblock) return null;
    const before = ($head.nodeBefore?.text ?? "").slice(-28);
    const after = ($head.nodeAfter?.text ?? "").slice(0, 28);
    if (!before && !after) return null;
    return {
      before, after,
      fraction: head / Math.max(1, view.state.doc.content.size),
      viewportY: Math.min(0.95, Math.max(0.05, (coords.top - rect.top) / rect.height)),
    };
  }

  /** Find source text near the original caret and restore the rich caret.
   * Protected HTML blocks cannot be edited in WYSIWYG and are intentionally
   * left to the caller's scroll-position fallback. */
  restoreCursor(anchor: CursorAnchor): boolean {
    const view = this.view();
    if (!view) return false;
    let best: { pos: number; quality: number } | null = null;
    const total = Math.max(1, view.state.doc.content.size);
    view.state.doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return;
      for (const candidate of matchingPositions(node.text, anchor)) {
        const target = pos + candidate.offset;
        const quality = candidate.score -
          Math.abs(target / total - anchor.fraction) * 12;
        if (!best || quality > best.quality) best = { pos: target, quality };
      }
    });
    if (!best) return false;
    const target = (best as { pos: number }).pos;
    view.focus();
    view.dispatch(view.state.tr.setSelection(
      TextSelection.near(view.state.doc.resolve(target)),
    ));
    requestAnimationFrame(() => {
      try {
        const rect = this.host.getBoundingClientRect();
        const coords = view.coordsAtPos(view.state.selection.head);
        this.host.scrollTop += coords.top - rect.top - rect.height * anchor.viewportY;
      } catch { /* layout can still be settling; selection is retained */ }
    });
    return true;
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

  /** Plain rendered text, excluding Markdown punctuation/markers. */
  plainText(): string {
    const view = this.view();
    if (!view) return "";
    return view.state.doc.textBetween(0, view.state.doc.content.size, "\n");
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
