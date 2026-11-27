// Thin wrapper around Milkdown Crepe: one editor instance, documents are
// swapped in place (tabbed editing keeps a single instance — see tabs.ts).
import { invoke } from "@tauri-apps/api/core";
import { Crepe } from "@milkdown/crepe";
import { isMermaidLanguage, renderMermaid } from "./mermaid";
import "@milkdown/crepe/theme/common/style.css";
import { replaceAll, $prose } from "@milkdown/kit/utils";
import {
  editorViewCtx,
  keymapCtx,
  parserCtx,
  remarkCtx,
  serializerCtx,
} from "@milkdown/kit/core";
import { codeBlockConfig } from "@milkdown/kit/component/code-block";
import { remarkPreserveEmptyLinePlugin } from "@milkdown/kit/preset/commonmark";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import { matchingPositions, type CursorAnchor } from "./cursor-position";
import { Plugin } from "@milkdown/kit/prose/state";
import { Prec } from "@codemirror/state";
import { keymap as codeMirrorKeymap } from "@codemirror/view";

import { linkFromClipboard } from "./link-clipboard";
import {
  configurePlainParagraph,
  insertPlainParagraph,
  withHeadlessDocLastChild,
} from "./plain-paragraph";
import {
  installBlockMenu,
  runBlockAction,
  type BlockActionId,
  type BlockMenuHandle,
} from "./block-menu";
import { emojiInputRule } from "./emoji";
import { listIndentKeymap } from "./list-indent";
import { t } from "./i18n";
import {
  configureMarkdownSerializer,
  markFencedLatexPlugin,
  patchTableCellMarkdown,
  safePreserveEmptyLinePlugin,
  type ListMarker,
} from "./markdown-serializer";
import { patchImageBlockMarkdown } from "./image-block-markdown";
import { imageToolbarPlugin } from "./image-toolbar";
import {
  patchHtmlMarkdown,
  resolveRawHtmlImages,
  safeHtmlPresentationPlugin,
} from "./html-markdown";
import {
  disposeAllWidgetFrames,
  htmlWidgetKey,
  htmlWidgetPlugin,
  retranslateWidgets,
  type HtmlWidgetMeta,
} from "./html-widget";
import { mikuCreamCodeMirrorTheme } from "./miku-cream";
import {
  PROTECTION_TOKEN_PATTERN,
  candidateParagraphs,
  findKnownUnsafeFragments,
  makeProtectionToken,
  maskFragments,
  restoreProtectedFragments,
  type ProtectedFragment,
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
  private protectedTokens = new Map<string, string>();
  private programmaticDocumentUpdate = false;
  /** A UTF-8 BOM belongs to the original source, not the Markdown parser.
   * Milkdown mishandles it in long documents and may corrupt unrelated bold
   * spans; restore the BOM whenever the source is read or saved. */
  private leadingBOM = "";
  /** The last actual document state reported as an edit. Milkdown's
   * markdownUpdated is debounced and may fire long after setContent(), even
   * when no user-facing document transaction occurred. */
  private lastNotifiedDoc: ProseNode | null = null;
  private serializedCache: { doc: ProseNode; bom: string; markdown: string } | null = null;

  private notifyActualEdit(): void {
    if (this.programmaticDocumentUpdate || !this.crepe) return;
    const doc = this.crepe.editor.ctx.get(editorViewCtx).state.doc;
    if (this.lastNotifiedDoc?.eq(doc)) return;
    this.lastNotifiedDoc = doc;
    this.onChange();
  }

  private captureDocumentBaseline(): void {
    if (!this.crepe) return;
    this.lastNotifiedDoc = this.crepe.editor.ctx.get(editorViewCtx).state.doc;
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
    interface MeasuredBlock {
      block: HTMLElement;
      top: number;
      height: number;
      lines: Array<{ top: number; height: number }>;
    }
    const toClear: HTMLElement[] = [];
    const measured: MeasuredBlock[] = [];

    // Phase 1: batch all DOM geometry reads to avoid per-block forced reflows.
    for (const block of this.host.querySelectorAll<HTMLElement>(
      ".milkdown-code-block",
    )) {
      const codeHost = block.querySelector<HTMLElement>(".codemirror-host");
      if (codeHost?.classList.contains("hidden")) {
        toClear.push(block);
        continue;
      }

      const content = block.querySelector<HTMLElement>(".cm-content");
      const lines = content?.querySelectorAll<HTMLElement>(".cm-line");
      if (!content || !lines?.length) {
        toClear.push(block);
        continue;
      }

      const blockRect = block.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      const lineMetrics: Array<{ top: number; height: number }> = [];
      lines.forEach((line) => {
        const lineRect = line.getBoundingClientRect();
        lineMetrics.push({
          top: lineRect.top - contentRect.top,
          height: lineRect.height,
        });
      });
      measured.push({
        block,
        top: contentRect.top - blockRect.top,
        height: contentRect.height,
        lines: lineMetrics,
      });
    }

    // Phase 2: apply all DOM mutations in a single write pass.
    for (const block of toClear) {
      block.querySelector(":scope > .mdmeow-code-line-numbers")?.remove();
    }
    for (const item of measured) {
      let rail = item.block.querySelector<HTMLElement>(
        ":scope > .mdmeow-code-line-numbers",
      );
      if (!rail) {
        rail = document.createElement("div");
        rail.className = "mdmeow-code-line-numbers";
        rail.setAttribute("aria-hidden", "true");
        item.block.appendChild(rail);
      }

      rail.style.top = `${item.top}px`;
      rail.style.height = `${item.height}px`;

      const fragment = document.createDocumentFragment();
      item.lines.forEach((metric, index) => {
        const number = document.createElement("span");
        number.textContent = String(index + 1);
        number.style.top = `${metric.top}px`;
        number.style.height = `${metric.height}px`;
        number.style.lineHeight = `${metric.height}px`;
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

  /** Bullet-list marker written on save. Read by the live serializer. */
  setListMarker(marker: ListMarker): void {
    this.listMarker = marker;
    this.serializedCache = null;
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
          // Crepe chains its LaTeX renderer in front of this fallback.
          renderPreview: (language, content, applyPreview) => {
            if (!isMermaidLanguage(language) || !content.trim()) return null;
            renderMermaid(content, applyPreview);
            return undefined;
          },
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
    await crepe.editor.remove(remarkPreserveEmptyLinePlugin);
    crepe.editor
      .config((ctx) => configureMarkdownSerializer(ctx, () => this.listMarker))
      .config(configurePlainParagraph)
      .config((ctx) => {
        // Keep fenced ```latex blocks editable as syntax-highlighted code;
        // display math `$$...$$` uses exact `"LaTeX"` and keeps KaTeX preview.
        ctx.update(codeBlockConfig.key, (prev) => {
          const upstream = prev.renderPreview;
          return {
            ...prev,
            renderPreview: (language, content, applyPreview) => {
              if (language !== "LaTeX" && language.toLowerCase() === "latex") {
                return null;
              }
              return upstream(language, content, applyPreview);
            },
          };
        });
      })
      .config((ctx) => {
        // ProseMirror's base keymap also supplies the old fixed exitCode key.
        ctx.get(keymapCtx).add({
          key: "Mod-Enter",
          priority: 1000,
          onRun: () => () => true,
        });
      })
      .use(safePreserveEmptyLinePlugin)
      .use(markFencedLatexPlugin)
      .use(linkFromClipboard)
      .use(findPlugin)
      .use(imageToolbarPlugin)
      .use(safeHtmlPresentationPlugin)
      .use(htmlWidgetPlugin)
      .use($prose(() => new Plugin({
        view: () => ({
          // Document transactions are observed immediately, not after
          // Milkdown's delayed markdownUpdated notification. This also
          // snapshots unsaved edits before a fast tab switch.
          update: (view, previous) => {
            if (!previous.doc.eq(view.state.doc)) {
              this.notifyActualEdit();
              resolveRawHtmlImages(this.host, this.resolveImageSrc);
            }
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
          return [...this.protectedTokens.keys()].every((token) => present.has(token));
        },
      })))
      .use(emojiInputRule)
      .use(listIndentKeymap);
    crepe.on((listener) => {
      listener.markdownUpdated(() => {
        // Also captures nested editors, without counting delayed initial loads.
        this.notifyActualEdit();
        this.scheduleExternalCodeLineNumbers();
        resolveRawHtmlImages(this.host, this.resolveImageSrc);
      });
      listener.selectionUpdated(() => {
        this.onSelectionChange();
      });
    });
    await crepe.create();
    this.crepe = crepe;
    patchImageBlockMarkdown(crepe);
    patchTableCellMarkdown(crepe);
    patchHtmlMarkdown(crepe, (token) => this.protectedTokens.get(token));
    this.blockMenu = installBlockMenu(crepe);
    if (markdown) await this.setContent(markdown);
    else {
      this.captureDocumentBaseline();
      this.scheduleExternalCodeLineNumbers();
    }
  }

  /** Yield one macrotask so the browser can paint loading UI and handle input. */
  private static yieldToMain(): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  /** Strip AST metadata and normalize harmless GFM equivalents for comparison. */
  private static normalizeAst(value: unknown): unknown {
    if (typeof value === "string") return value.replace(/\r\n?/g, "\n");
    if (Array.isArray(value)) return value.map((item) => Editor.normalizeAst(item));
    if (value && typeof value === "object") {
      const raw = value as Record<string, unknown>;
      const entries = Object.entries(raw)
        .filter(([key]) => key !== "position" && key !== "data")
        .map(([key, item]) => [key, Editor.normalizeAst(item)] as [string, unknown]);
      const obj = Object.fromEntries(entries);

      // Milkdown canonicalizes standalone `<br>`/`<br/>` empty-line markers to `<br />`.
      if (
        (obj.type === "root" || obj.type === "blockquote" || obj.type === "listItem") &&
        Array.isArray(obj.children)
      ) {
        obj.children = obj.children.map((child) => {
          if (!child || typeof child !== "object") return child;
          const c = child as Record<string, unknown>;
          if (
            c.type === "html" &&
            typeof c.value === "string" &&
            /^<br\s*\/?>$/i.test(c.value.trim())
          ) {
            return { ...c, value: "<br />" };
          }
          return child;
        });
      }
      if (
        obj.type === "paragraph" &&
        Array.isArray(obj.children) &&
        obj.children.length === 1
      ) {
        const only = obj.children[0] as Record<string, unknown> | undefined;
        if (
          only?.type === "html" &&
          typeof only.value === "string" &&
          /^<br\s*\/?>$/i.test(only.value.trim())
        ) {
          obj.children = [{ ...only, value: "<br />" }];
        }
      }

      // GFM 4.10: body rows with fewer cells than the header row are padded
      // with empty trailing cells (excess cells are *not* padded here because
      // GFM ignores excess body cells while Milkdown would widen the header).
      if (obj.type === "table" && Array.isArray(obj.children) && obj.children.length > 0) {
        const header = obj.children[0] as { children?: unknown[] } | undefined;
        const headerCols = Array.isArray(header?.children) ? header.children.length : 0;
        if (headerCols > 0) {
          obj.children = obj.children.map((row, idx) => {
            if (idx === 0 || !row || typeof row !== "object") return row;
            const r = row as { type?: string; children?: unknown[] };
            if (
              r.type === "tableRow" &&
              Array.isArray(r.children) &&
              r.children.length < headerCols
            ) {
              const padded = [...r.children];
              while (padded.length < headerCols) {
                padded.push({ type: "tableCell", children: [] });
              }
              return { ...r, children: padded };
            }
            return row;
          });
        }
      }

      return obj;
    }
    return value;
  }

  /** Round-trip Markdown in memory via Milkdown's parser + serializer without
   * mutating the live ProseMirror DOM, CodeMirror instances, or KaTeX views. */
  private roundTripHeadless(content: string): {
    safe: boolean;
    serialized: string | null;
  } {
    if (!this.crepe) return { safe: false, serialized: null };
    if (content === "") return { safe: true, serialized: "" };
    try {
      const ctx = this.crepe.editor.ctx;
      const parser = ctx.get(parserCtx);
      const serializer = ctx.get(serializerCtx);
      const doc = parser(content);
      if (!doc) return { safe: false, serialized: null };
      const serialized = withHeadlessDocLastChild(doc.lastChild, () =>
        serializer(doc),
      );
      return {
        safe: this.isAstEquivalent(content, serialized),
        serialized,
      };
    } catch {
      return { safe: false, serialized: null };
    }
  }

  /** Compare the parsed remark ASTs of `source` and `serialized`. */
  private isAstEquivalent(source: string, serialized: string): boolean {
    if (serialized === source) return true;
    if (!this.crepe) return false;
    try {
      const processor = this.crepe.editor.ctx.get(remarkCtx);
      const a = Editor.normalizeAst(processor.parse(source));
      const b = Editor.normalizeAst(processor.parse(serialized));
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }

  /** Fast O(N) top-level AST diff: when block counts match, pinpoint every
   * differing top-level block directly using remark source offsets — works
   * regardless of file length or block count. */
  private findAstDiffFragments(
    source: string,
    serialized: string,
  ): ProtectedFragment[] | null {
    if (!this.crepe) return null;
    try {
      const processor = this.crepe.editor.ctx.get(remarkCtx);
      const rawA = processor.parse(source) as {
        children?: Array<{
          position?: { start?: { offset?: number }; end?: { offset?: number } };
        }>;
      };
      const rawB = processor.parse(serialized) as { children?: unknown[] };
      const childrenA = rawA.children;
      const childrenB = rawB.children;
      if (
        !Array.isArray(childrenA) ||
        !Array.isArray(childrenB) ||
        childrenA.length !== childrenB.length
      ) {
        return null;
      }

      const diffs: ProtectedFragment[] = [];
      for (let i = 0; i < childrenA.length; i++) {
        const normA = Editor.normalizeAst(childrenA[i]);
        const normB = Editor.normalizeAst(childrenB[i]);
        if (JSON.stringify(normA) === JSON.stringify(normB)) continue;
        const start = childrenA[i].position?.start?.offset;
        const end = childrenA[i].position?.end?.offset;
        if (
          typeof start !== "number" ||
          typeof end !== "number" ||
          start < 0 ||
          end <= start ||
          end > source.length
        ) {
          return null;
        }
        if (source.slice(start, end).includes("<mdmeow-parse-error")) continue;
        diffs.push({ start, end });
      }
      return diffs.length ? diffs : null;
    } catch {
      return null;
    }
  }

  /** Load Markdown into WYSIWYG, hiding only the spans that cannot be
   * safely parsed. Protected spans are encoded in atomic HTML nodes and
   * restored verbatim whenever Markdown is read or saved. Returns `false` if
   * the load was superseded before mounting. */
  async setContent(
    markdown: string,
    options?: {
      isCancelled?: () => boolean;
      yieldBeforeMount?: boolean;
      allowHtmlWidgets?: boolean;
    },
  ): Promise<boolean> {
    if (!this.crepe) return false;
    const cancelled = options?.isCancelled ?? (() => false);

    // BOM is a file encoding marker, not Markdown syntax. Hide it during
    // parsing so Crepe cannot alter unrelated bold text, but restore it
    // when reading the Markdown for editing or saving.
    const leadingBOM = markdown.startsWith("\uFEFF") ? "\uFEFF" : "";
    const body = leadingBOM ? markdown.slice(1) : markdown;

    const originals = new Map<string, string>();
    const processor = this.crepe.editor.ctx.get(remarkCtx);
    const fragments = findKnownUnsafeFragments(body, (text) => processor.parse(text));
    let prepared = maskFragments(body, fragments, originals);
    const initial = body
      ? this.roundTripHeadless(prepared)
      : { safe: true, serialized: "" };
    if (cancelled()) return false;

    if (!initial.safe) {
      // Fast path: directly locate differing top-level blocks from the AST
      // (no paragraph limit, no live-DOM remounts).
      const astDiffs =
        initial.serialized !== null
          ? this.findAstDiffFragments(prepared, initial.serialized)
          : null;
      if (astDiffs?.length) {
        const candidate = maskFragments(prepared, astDiffs, originals);
        if (this.roundTripHeadless(candidate).safe) {
          prepared = candidate;
        }
      }
    }

    if (cancelled()) return false;

    if (!initial.safe && !this.roundTripHeadless(prepared).safe) {
      // General fallback: divide-and-conquer binary search across *all*
      // candidate paragraphs in memory (O(k log N) headless checks, yielding
      // cooperatively so large files never freeze the window).
      const sections = candidateParagraphs(prepared);
      const unsafe: ProtectedFragment[] = [];
      let probes = 0;
      const MAX_PROBES = 240;
      let lastYield = performance.now();

      const locate = async (lo: number, hi: number): Promise<void> => {
        if (cancelled() || lo >= hi || probes >= MAX_PROBES) return;
        if (performance.now() - lastYield > 12) {
          await Editor.yieldToMain();
          lastYield = performance.now();
          if (cancelled()) return;
        }
        const slice = prepared.slice(sections[lo].start, sections[hi - 1].end);
        probes += 1;
        if (this.roundTripHeadless(slice).safe) return;
        if (hi - lo === 1) {
          unsafe.push(sections[lo]);
          return;
        }
        const mid = (lo + hi) >> 1;
        await locate(lo, mid);
        await locate(mid, hi);
      };

      await locate(0, sections.length);
      if (cancelled()) return false;

      if (unsafe.length) {
        prepared = maskFragments(prepared, unsafe, originals);
      }
      if (!this.roundTripHeadless(prepared).safe) {
        // Cross-block interaction that paragraph localization could not isolate:
        // preserve the exact source losslessly rather than discarding any text.
        prepared = makeProtectionToken(body, originals);
      }
    }

    if (cancelled()) return false;
    if (options?.yieldBeforeMount) {
      await Editor.yieldToMain();
      if (cancelled() || !this.crepe) return false;
    }

    this.leadingBOM = leadingBOM;
    this.serializedCache = null;
    this.programmaticDocumentUpdate = true;
    try {
      // Drop tokens from rejected fallback probes. Guard only real HTML atoms.
      const expected = new Map<string, string>();
      for (const [token] of prepared.matchAll(PROTECTION_TOKEN_PATTERN)) {
        const raw = originals.get(token);
        if (raw !== undefined) expected.set(token, raw);
      }
      this.protectedTokens = expected;
      this.setHtmlWidgetsAllowed(false, true);
      this.crepe.editor.action(replaceAll(prepared, true));
      if (options?.allowHtmlWidgets) {
        this.setHtmlWidgetsAllowed(true, true);
      }
      if (expected.size) {
        const missing = new Set(expected.keys());
        this.view()?.state.doc.descendants((node) => {
          if (node.type.name === "html") missing.delete(String(node.attrs.value).trim());
        });
        if (missing.size) throw new Error("Protected source could not be represented in the preview");
      }
    } finally {
      // Loading the source is not a user edit. Capture its rendered ProseMirror
      // state now, before a debounced markdownUpdated fires.
      this.captureDocumentBaseline();
      this.programmaticDocumentUpdate = false;
    }
    resolveRawHtmlImages(this.host, this.resolveImageSrc);
    this.scheduleExternalCodeLineNumbers();
    return true;
  }

  getMarkdown(): string {
    const view = this.view();
    if (
      view &&
      this.serializedCache &&
      this.serializedCache.doc === view.state.doc &&
      this.serializedCache.bom === this.leadingBOM
    ) {
      return this.serializedCache.markdown;
    }
    const markdown =
      this.leadingBOM + restoreProtectedFragments(this.crepe?.getMarkdown() ?? "", this.protectedTokens);
    if (view) {
      this.serializedCache = {
        doc: view.state.doc,
        bom: this.leadingBOM,
        markdown,
      };
    }
    return markdown;
  }

  get protectedFragmentCount(): number {
    return this.protectedTokens.size;
  }

  /** Interactive HTML web widgets detected in the active document. */
  htmlWidgetSummary(): { count: number; hasScript: boolean } {
    const view = this.view();
    const groups = view ? (htmlWidgetKey.getState(view.state)?.groups ?? []) : [];
    return {
      count: groups.length,
      hasScript: groups.some((g) => g.hasScript),
    };
  }

  /** Enable or disable sandboxed HTML widget rendering for the active document. */
  setHtmlWidgetsAllowed(allowed: boolean, resetSource = false): void {
    const view = this.view();
    if (!view) return;
    const prev = this.programmaticDocumentUpdate;
    this.programmaticDocumentUpdate = true;
    try {
      view.dispatch(
        view.state.tr.setMeta(htmlWidgetKey, {
          type: "setAllowed",
          allowed,
          resetSource,
        } satisfies HtmlWidgetMeta),
      );
    } finally {
      this.programmaticDocumentUpdate = prev;
    }
  }

  /** Allow only semantic-preserving Markdown normalization in WYSIWYG.
   * The original bytes remain the tab's saved baseline until an explicit edit.
   * Unknown/lost nodes and front matter always fall back to source mode. */
  isSafeToRender(source: string): boolean {
    const serialized = this.crepe?.getMarkdown() ?? "";
    return this.isAstEquivalent(source, serialized);
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
    retranslateWidgets(this.host);
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
    return view.state.doc.textBetween(
      0,
      view.state.doc.content.size,
      "\n",
      (leafNode) => {
        if (leafNode.type.name === "html") {
          const value = String(leafNode.attrs?.value ?? "").trim();
          const original = this.protectedTokens.get(value);
          if (original !== undefined) return original;
        }
        if (leafNode.type.name === "math_inline") {
          return String(leafNode.attrs?.value ?? "");
        }
        return "";
      },
    );
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
    disposeAllWidgetFrames();
    if (this.lineNumberFrame !== null) {
      window.cancelAnimationFrame(this.lineNumberFrame);
      this.lineNumberFrame = null;
    }
    this.serializedCache = null;
    this.lastNotifiedDoc = null;
    this.blockMenu?.dispose();
    this.blockMenu = null;
    if (this.crepe) {
      await this.crepe.destroy();
      this.crepe = null;
    }
    this.host.replaceChildren();
  }
}
