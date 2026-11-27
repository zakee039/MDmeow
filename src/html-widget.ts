// Render self-contained interactive HTML web widgets inside strictly sandboxed
// iframes without mutating the underlying ProseMirror `html` nodes, so Markdown
// round-tripping and source mode remain 100% lossless.
//
// Security model:
//   * Widgets never execute in the host Tauri WebView document.
//   * Every widget runs inside `<iframe sandbox="allow-scripts">` (NO
//     `allow-same-origin`, NO `allow-modals`, NO `allow-popups`, NO
//     `allow-forms`, NO `allow-top-navigation`) with an offline CSP
//     (`default-src 'none'`).
//   * Execution is gated per document: nothing renders until the user explicitly
//     clicks "Show" in MDmeow's confirmation dialog.

import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";

import { t } from "./i18n";

const PROTECTION_TOKEN_RE = /^<mdmeow-parse-error\b/i;
const MORE_COMMENT_RE = /^<!--\s*more\s*-->$/i;
const BR_TAG_RE = /^<br\s*\/?>$/i;
const DETAILS_OPEN_RE = /^<details\b([^<>]*)>$/i;
const DETAILS_HEADER_RE = /^(<details\b[^<>]*>)\s*(<summary\b[\s\S]*<\/summary\s*>)$/i;
const DETAILS_CLOSE_RE = /^<\/details\s*>$/i;
const SUMMARY_ONLY_RE = /^<summary\b[^>]*>[\s\S]*<\/summary\s*>$/i;
const DIV_OPEN_ONLY_RE = /^<div\b[^>]*>$/i;
const DIV_CLOSE_RE = /^<\/div\s*>$/i;
const KBD_OPEN_RE = /^<kbd\s*>$/i;
const KBD_CLOSE_RE = /^<\/kbd\s*>$/i;
const CLOSING_TAG_ONLY_RE = /^<\/[a-z][a-z0-9-]*\s*>$/i;
const SINGLE_OPENING_TAG_RE = /^<([a-z][a-z0-9-]*)\b[^>]*>$/i;

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const INTERACTIVE_SELECTOR =
  "input, button, select, textarea, output, canvas, meter, progress, form, fieldset";

const HEIGHT_MSG_TYPE = "mdmeow-widget-height";
const MIN_WIDGET_HEIGHT = 28;
const MAX_WIDGET_HEIGHT = 4000;

interface BlockInfo {
  index: number;
  pos: number;
  end: number;
  kind: "none" | "style" | "script" | "fragment";
  raw: string;
  hasEmbeddedScript: boolean;
  hasEmbeddedStyle: boolean;
  hasInteractiveControl: boolean;
}

export interface HtmlWidgetGroup {
  /** Stable identifier within the document (content hash + occurrence index). */
  key: string;
  /** Document position right before the first block of this widget group. */
  anchorPos: number;
  /** Every top-level block range belonging to this widget group. */
  blockRanges: Array<{ pos: number; end: number }>;
  styles: string[];
  html: string;
  scripts: string[];
  hasScript: boolean;
}

export interface HtmlWidgetPluginState {
  allowed: boolean;
  sourceVisible: Set<string>;
  groups: HtmlWidgetGroup[];
  decorations: DecorationSet;
}

export type HtmlWidgetMeta =
  | { type: "setAllowed"; allowed: boolean; resetSource?: boolean }
  | { type: "toggleSource"; key: string };

export const htmlWidgetKey = new PluginKey<HtmlWidgetPluginState>("mdmeow-html-widget");

const activeFrames = new Map<string, HTMLIFrameElement>();
let messageListenerAttached = false;
let frameSeq = 0;

function pruneDisconnectedFrames(): void {
  for (const [id, frame] of activeFrames) {
    if (!frame.isConnected) activeFrames.delete(id);
  }
}

function ensureHeightMessageListener(): void {
  if (messageListenerAttached || typeof window === "undefined") return;
  messageListenerAttached = true;
  window.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as { type?: unknown; id?: unknown; height?: unknown } | null;
    if (!data || data.type !== HEIGHT_MSG_TYPE || typeof data.id !== "string") return;
    const frame = activeFrames.get(data.id);
    if (!frame) return;
    if (!frame.isConnected) {
      activeFrames.delete(data.id);
      return;
    }
    if (event.source !== frame.contentWindow) return;
    const height = Number(data.height);
    if (!Number.isFinite(height) || height <= 0) return;
    const clamped = Math.max(MIN_WIDGET_HEIGHT, Math.min(MAX_WIDGET_HEIGHT, Math.ceil(height)));
    frame.style.height = `${clamped}px`;
  });
}

function hashText(input: string): string {
  // Fast deterministic FNV-1a 32-bit hash for stable ProseMirror widget keys.
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function hasInlineEventAttr(root: DocumentFragment): boolean {
  const stack: Element[] = [...root.children];
  while (stack.length > 0) {
    const el = stack.pop()!;
    for (const attr of Array.from(el.attributes)) {
      if (/^on[a-z]+$/i.test(attr.name)) return true;
    }
    for (const child of Array.from(el.children)) stack.push(child);
  }
  return false;
}

function isHandledBySafeHtml(trimmed: string): boolean {
  if (
    !trimmed ||
    PROTECTION_TOKEN_RE.test(trimmed) ||
    MORE_COMMENT_RE.test(trimmed) ||
    BR_TAG_RE.test(trimmed) ||
    DETAILS_OPEN_RE.test(trimmed) ||
    DETAILS_HEADER_RE.test(trimmed) ||
    DETAILS_CLOSE_RE.test(trimmed) ||
    SUMMARY_ONLY_RE.test(trimmed) ||
    DIV_OPEN_ONLY_RE.test(trimmed) ||
    DIV_CLOSE_RE.test(trimmed) ||
    KBD_OPEN_RE.test(trimmed) ||
    KBD_CLOSE_RE.test(trimmed) ||
    CLOSING_TAG_ONLY_RE.test(trimmed)
  ) {
    return true;
  }

  // Leave bare unclosed non-void opening tags (e.g. `<section class="x">`)
  // untouched so split HTML wrappers around Markdown paragraphs are never eaten.
  const openOnly = SINGLE_OPENING_TAG_RE.exec(trimmed);
  if (openOnly && !/\/>$/.test(trimmed) && !VOID_TAGS.has(openOnly[1].toLowerCase())) {
    return true;
  }

  return false;
}

function classifyHtmlBlock(raw: string): Omit<BlockInfo, "index" | "pos" | "end"> {
  const none: Omit<BlockInfo, "index" | "pos" | "end"> = {
    kind: "none",
    raw,
    hasEmbeddedScript: false,
    hasEmbeddedStyle: false,
    hasInteractiveControl: false,
  };
  const trimmed = raw.trim();
  if (isHandledBySafeHtml(trimmed) || !trimmed.startsWith("<")) return none;

  const template = document.createElement("template");
  template.innerHTML = trimmed;
  const meaningful = Array.from(template.content.childNodes).filter(
    (node) =>
      node.nodeType !== Node.COMMENT_NODE &&
      (node.nodeType !== Node.TEXT_NODE || Boolean(node.textContent?.trim())),
  );
  if (meaningful.length === 0) return none;

  const elements = meaningful.filter((node): node is Element => node.nodeType === Node.ELEMENT_NODE);
  if (elements.length === 0) return none;

  // Single <img> is already rendered directly by html-markdown.ts.
  if (
    meaningful.length === 1 &&
    elements.length === 1 &&
    elements[0].tagName === "IMG"
  ) {
    return none;
  }

  // Only <script> element(s)
  if (
    meaningful.length === elements.length &&
    elements.every((el) => el.tagName === "SCRIPT")
  ) {
    return {
      kind: "script",
      raw: trimmed,
      hasEmbeddedScript: true,
      hasEmbeddedStyle: false,
      hasInteractiveControl: false,
    };
  }

  // Only <style> element(s)
  if (
    meaningful.length === elements.length &&
    elements.every((el) => el.tagName === "STYLE")
  ) {
    return {
      kind: "style",
      raw: trimmed,
      hasEmbeddedScript: false,
      hasEmbeddedStyle: true,
      hasInteractiveControl: false,
    };
  }

  const hasEmbeddedScript =
    template.content.querySelector("script") !== null || hasInlineEventAttr(template.content);
  const hasEmbeddedStyle = template.content.querySelector("style") !== null;
  const hasInteractiveControl = template.content.querySelector(INTERACTIVE_SELECTOR) !== null;

  return {
    kind: "fragment",
    raw: trimmed,
    hasEmbeddedScript,
    hasEmbeddedStyle,
    hasInteractiveControl,
  };
}

/** Scan a ProseMirror document and group raw HTML blocks that form interactive
 *  web widgets (e.g. an HTML container optionally preceded by `<style>` and/or
 *  followed by `<script>`). */
export function collectHtmlWidgetGroups(doc: ProseNode): HtmlWidgetGroup[] {
  const blocks: BlockInfo[] = [];
  doc.forEach((block, pos, index) => {
    const atom = block.firstChild;
    if (block.childCount !== 1 || atom?.type.name !== "html") {
      blocks.push({
        index,
        pos,
        end: pos + block.nodeSize,
        kind: "none",
        raw: "",
        hasEmbeddedScript: false,
        hasEmbeddedStyle: false,
        hasInteractiveControl: false,
      });
      return;
    }
    const raw = String(atom.attrs?.value ?? "");
    blocks.push({
      index,
      pos,
      end: pos + block.nodeSize,
      ...classifyHtmlBlock(raw),
    });
  });

  const groups: HtmlWidgetGroup[] = [];
  const seenHashes = new Map<string, number>();

  let i = 0;
  while (i < blocks.length) {
    const start = i;
    const leadingStyles: BlockInfo[] = [];
    while (i < blocks.length && blocks[i].kind === "style") {
      leadingStyles.push(blocks[i]);
      i++;
    }

    if (i >= blocks.length || blocks[i].kind !== "fragment") {
      // Orphan style or non-fragment block: skip past what we scanned.
      if (i === start) i++;
      continue;
    }

    const fragment = blocks[i];
    i++;

    const trailingStyles: BlockInfo[] = [];
    const trailingScripts: BlockInfo[] = [];
    while (i < blocks.length && (blocks[i].kind === "style" || blocks[i].kind === "script")) {
      if (blocks[i].kind === "style") {
        // A <style> block followed by another HTML fragment belongs to the next widget.
        let look = i;
        while (look < blocks.length && blocks[look].kind === "style") look++;
        if (look < blocks.length && blocks[look].kind === "fragment") break;
        trailingStyles.push(blocks[i]);
      } else {
        trailingScripts.push(blocks[i]);
      }
      i++;
    }

    const hasScript = fragment.hasEmbeddedScript || trailingScripts.length > 0;
    const hasStyle =
      leadingStyles.length > 0 || trailingStyles.length > 0 || fragment.hasEmbeddedStyle;
    const isWidget = hasScript || hasStyle || fragment.hasInteractiveControl;

    if (!isWidget) continue;

    const members = [...leadingStyles, fragment, ...trailingStyles, ...trailingScripts];
    const styles = [...leadingStyles, ...trailingStyles].map((b) => b.raw);
    const scripts = trailingScripts.map((b) => b.raw);
    const combinedSignature = `${styles.join("\n")}\0${fragment.raw}\0${scripts.join("\n")}`;
    const baseHash = hashText(combinedSignature);
    const ordinal = seenHashes.get(baseHash) ?? 0;
    seenHashes.set(baseHash, ordinal + 1);

    groups.push({
      key: `${baseHash}-${ordinal}`,
      anchorPos: members[0].pos,
      blockRanges: members.map((m) => ({ pos: m.pos, end: m.end })),
      styles,
      html: fragment.raw,
      scripts,
      hasScript,
    });
  }

  return groups;
}

/** Build the sandboxed iframe `srcdoc` document for a widget group. */
export function buildWidgetSrcdoc(group: HtmlWidgetGroup, frameId: string): string {
  const csp =
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:;";
  const safeId = JSON.stringify(frameId);
  const styleBlock = group.styles.join("\n");
  const scriptBlock = group.scripts.join("\n");

  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    "<style>",
    "*, *::before, *::after { box-sizing: border-box; }",
    "html, body { margin: 0; padding: 0; height: auto; background: transparent; overflow-x: auto; overflow-y: hidden; }",
    'body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif; line-height: 1.5; color: #213b3a; }',
    "#__mdmeow_widget_root__ { display: flow-root; padding: 2px; }",
    "</style>",
    styleBlock,
    "</head>",
    "<body>",
    '<div id="__mdmeow_widget_root__">',
    group.html,
    "</div>",
    scriptBlock,
    "<script>",
    "(function () {",
    `  var id = ${safeId};`,
    "  var root = document.getElementById('__mdmeow_widget_root__');",
    "  var last = -1;",
    "  function measure() {",
    "    if (!root) return 0;",
    "    var rect = root.getBoundingClientRect();",
    "    return Math.ceil(Math.max(rect.height, root.scrollHeight));",
    "  }",
    "  function post() {",
    "    var h = measure();",
    "    if (h > 0 && h !== last) {",
    "      last = h;",
    `      try { parent.postMessage({ type: '${HEIGHT_MSG_TYPE}', id: id, height: h }, '*'); } catch (e) {}`,
    "    }",
    "  }",
    "  if (typeof ResizeObserver === 'function' && root) {",
    "    new ResizeObserver(post).observe(root);",
    "  }",
    "  if (typeof MutationObserver === 'function' && root) {",
    "    new MutationObserver(post).observe(root, { childList: true, subtree: true, attributes: true, characterData: true });",
    "  }",
    "  window.addEventListener('load', post);",
    "  window.addEventListener('resize', post);",
    "  post();",
    "  setTimeout(post, 40);",
    "  setTimeout(post, 220);",
    "})();",
    "</script>",
    "</body>",
    "</html>",
  ].join("\n");
}

function buildWidgetDecorations(
  doc: ProseNode,
  groups: HtmlWidgetGroup[],
  allowed: boolean,
  sourceVisible: Set<string>,
): DecorationSet {
  if (!allowed || groups.length === 0) return DecorationSet.empty;

  const decorations: Decoration[] = [];
  for (const group of groups) {
    const showingSource = sourceVisible.has(group.key);
    if (showingSource) {
      decorations.push(
        Decoration.widget(
          group.anchorPos,
          (view) => createSourceBarElement(view, group),
          {
            side: -1,
            key: `mdmeow-widget-source:${group.key}`,
            stopEvent: () => true,
            ignoreSelection: true,
          },
        ),
      );
      continue;
    }

    for (const range of group.blockRanges) {
      decorations.push(
        Decoration.node(range.pos, range.end, { class: "mdmeow-html-marker-block" }),
      );
    }

    decorations.push(
      Decoration.widget(
        group.anchorPos,
        (view) => createWidgetCardElement(view, group),
        {
          side: -1,
          key: `mdmeow-widget-frame:${group.key}`,
          stopEvent: () => true,
          ignoreSelection: true,
        },
      ),
    );
  }

  return DecorationSet.create(doc, decorations);
}

function createSourceBarElement(view: EditorView, group: HtmlWidgetGroup): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "mdmeow-widget-source-bar";
  bar.contentEditable = "false";

  const badge = document.createElement("span");
  badge.className = "mdmeow-widget-badge";
  badge.dataset.mdmeowWidgetLabel = "badge";
  badge.textContent = t("widget.badge");

  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "mdmeow-widget-btn";
  backBtn.dataset.mdmeowWidgetLabel = "showPreview";
  backBtn.textContent = t("widget.showPreview");
  backBtn.addEventListener("mousedown", (e) => e.preventDefault());
  backBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    view.dispatch(
      view.state.tr.setMeta(htmlWidgetKey, {
        type: "toggleSource",
        key: group.key,
      } satisfies HtmlWidgetMeta),
    );
  });

  bar.append(badge, backBtn);
  return bar;
}

function createWidgetCardElement(view: EditorView, group: HtmlWidgetGroup): HTMLElement {
  ensureHeightMessageListener();
  pruneDisconnectedFrames();

  const shell = document.createElement("div");
  shell.className = "mdmeow-widget-shell";
  shell.contentEditable = "false";

  const tools = document.createElement("div");
  tools.className = "mdmeow-widget-tools";

  const sourceBtn = document.createElement("button");
  sourceBtn.type = "button";
  sourceBtn.className = "mdmeow-widget-btn";
  sourceBtn.dataset.mdmeowWidgetLabel = "viewSource";
  sourceBtn.textContent = t("widget.viewSource");
  sourceBtn.addEventListener("mousedown", (e) => e.preventDefault());
  sourceBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    view.dispatch(
      view.state.tr.setMeta(htmlWidgetKey, {
        type: "toggleSource",
        key: group.key,
      } satisfies HtmlWidgetMeta),
    );
  });
  tools.appendChild(sourceBtn);

  const frameId = `mdmeow-w-${++frameSeq}-${Math.random().toString(36).slice(2, 8)}`;
  const iframe = document.createElement("iframe");
  iframe.className = "mdmeow-widget-frame";
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.setAttribute("referrerpolicy", "no-referrer");
  iframe.setAttribute("title", t("widget.badge"));
  iframe.style.height = "120px";
  activeFrames.set(frameId, iframe);
  iframe.srcdoc = buildWidgetSrcdoc(group, frameId);

  shell.append(tools, iframe);
  return shell;
}

export const htmlWidgetPlugin = $prose(
  () =>
    new Plugin<HtmlWidgetPluginState>({
      key: htmlWidgetKey,
      state: {
        init: (_, state) => {
          const groups = collectHtmlWidgetGroups(state.doc);
          return {
            allowed: false,
            sourceVisible: new Set<string>(),
            groups,
            decorations: DecorationSet.empty,
          };
        },
        apply(tr, prev) {
          const meta = tr.getMeta(htmlWidgetKey) as HtmlWidgetMeta | undefined;
          if (!tr.docChanged && !meta) return prev;

          let allowed = prev.allowed;
          let sourceVisible = prev.sourceVisible;

          if (meta?.type === "setAllowed") {
            allowed = meta.allowed;
            if (meta.resetSource || !allowed) sourceVisible = new Set<string>();
          } else if (meta?.type === "toggleSource") {
            sourceVisible = new Set(prev.sourceVisible);
            if (sourceVisible.has(meta.key)) sourceVisible.delete(meta.key);
            else sourceVisible.add(meta.key);
          }

          const groups = tr.docChanged ? collectHtmlWidgetGroups(tr.doc) : prev.groups;
          if (tr.docChanged && sourceVisible.size > 0) {
            const validKeys = new Set(groups.map((g) => g.key));
            const nextSource = new Set<string>();
            for (const key of sourceVisible) {
              if (validKeys.has(key)) nextSource.add(key);
            }
            sourceVisible = nextSource;
          }

          const decorations = buildWidgetDecorations(tr.doc, groups, allowed, sourceVisible);
          return { allowed, sourceVisible, groups, decorations };
        },
      },
      props: {
        decorations: (state) => htmlWidgetKey.getState(state)?.decorations,
      },
    }),
);

export function retranslateWidgets(host: HTMLElement): void {
  host.querySelectorAll<HTMLElement>("[data-mdmeow-widget-label]").forEach((el) => {
    const kind = el.dataset.mdmeowWidgetLabel;
    if (kind === "badge") el.textContent = t("widget.badge");
    else if (kind === "viewSource") el.textContent = t("widget.viewSource");
    else if (kind === "showPreview") el.textContent = t("widget.showPreview");
  });
  host.querySelectorAll<HTMLIFrameElement>("iframe.mdmeow-widget-frame").forEach((frame) => {
    frame.setAttribute("title", t("widget.badge"));
  });
}

export function disposeAllWidgetFrames(): void {
  activeFrames.clear();
}
