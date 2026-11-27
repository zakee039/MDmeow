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
const HTML_COMMENT_RE = /^<!--(?:(?!-->)[\s\S])*-->$/;
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
const RICH_NESTED_SELECTOR =
  "div, section, article, table, figure, header, footer, aside, nav, ul, ol, svg";
const NON_CARD_ROOT_TAGS = new Set([
  "DETAILS",
  "A",
  "KBD",
  "IMG",
  "P",
  "CENTER",
  "SPAN",
  "RUBY",
  "RT",
  "RP",
  "MARK",
  "SUB",
  "SUP",
  "SMALL",
  "U",
  "INS",
  "FONT",
  "STRONG",
  "B",
  "EM",
  "I",
  "CODE",
]);

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
  hasRichVisualLayout: boolean;
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

let messageListenerAttached = false;
let frameSeq = 0;

function ensureHeightMessageListener(): void {
  if (messageListenerAttached || typeof window === "undefined") return;
  messageListenerAttached = true;
  window.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as { type?: unknown; id?: unknown; height?: unknown } | null;
    if (!data || data.type !== HEIGHT_MSG_TYPE || typeof data.id !== "string") return;
    const frames = document.querySelectorAll<HTMLIFrameElement>(
      "iframe.mdmeow-widget-frame[data-mdmeow-widget-id]",
    );
    for (const frame of Array.from(frames)) {
      if (frame.dataset.mdmeowWidgetId !== data.id) continue;
      if (event.source !== frame.contentWindow) return;
      const height = Number(data.height);
      if (!Number.isFinite(height) || height <= 0) return;
      const clamped = Math.max(MIN_WIDGET_HEIGHT, Math.min(MAX_WIDGET_HEIGHT, Math.ceil(height)));
      frame.style.height = `${clamped}px`;
      return;
    }
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
    HTML_COMMENT_RE.test(trimmed) ||
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

function hasRelativeImg(root: DocumentFragment): boolean {
  for (const img of Array.from(root.querySelectorAll("img"))) {
    const src = (img.getAttribute("src") ?? "").trim();
    if (!src) continue;
    if (/^(?:data|blob):/i.test(src)) continue;
    return true;
  }
  return false;
}

function detectRichVisualLayout(root: DocumentFragment, elements: Element[]): boolean {
  if (hasRelativeImg(root)) return false;
  if (root.querySelector("svg") !== null) return true;
  if (elements.length === 1 && elements[0].tagName === "TABLE") return true;
  if (elements.length === 1 && NON_CARD_ROOT_TAGS.has(elements[0].tagName)) {
    return false;
  }
  const hasStyledEl = root.querySelector("[style]") !== null;
  if (!hasStyledEl) return false;
  // Require real visual card structure (nested block/table/svg elements or
  // box styling on the root container) so plain inline tags stay untouched.
  for (const el of elements) {
    if (el.querySelector(RICH_NESTED_SELECTOR) !== null) return true;
    const style = el.getAttribute("style") ?? "";
    if (/(?:display\s*:\s*(?:flex|grid)|border|background|padding|box-shadow|border-radius)/i.test(style)) {
      return true;
    }
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
    hasRichVisualLayout: false,
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
      hasRichVisualLayout: false,
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
      hasRichVisualLayout: false,
    };
  }

  const hasEmbeddedScript =
    template.content.querySelector("script") !== null || hasInlineEventAttr(template.content);
  const hasEmbeddedStyle = template.content.querySelector("style") !== null;
  const hasInteractiveControl = template.content.querySelector(INTERACTIVE_SELECTOR) !== null;
  const hasRichVisualLayout = detectRichVisualLayout(template.content, elements);

  return {
    kind: "fragment",
    raw: trimmed,
    hasEmbeddedScript,
    hasEmbeddedStyle,
    hasInteractiveControl,
    hasRichVisualLayout,
  };
}

function escapeHtmlText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Extract raw HTML from either a single-atom HTML block (e.g. `<div>`, `<table>`,
 *  `<script>`, `<style>`) or a paragraph whose inline children form a complete
 *  non-CommonMark-block HTML element (e.g. `<canvas>fallback</canvas>`,
 *  `<progress>68%</progress>`, `<video>...</video>`). */
function extractRawHtmlFromBlock(block: ProseNode): string | null {
  if (block.childCount === 1 && block.firstChild?.type.name === "html") {
    return String(block.firstChild.attrs?.value ?? "");
  }
  if (
    block.type.name !== "paragraph" ||
    block.childCount < 2 ||
    block.firstChild?.type.name !== "html" ||
    block.lastChild?.type.name !== "html"
  ) {
    return null;
  }

  let out = "";
  for (let i = 0; i < block.childCount; i++) {
    const child = block.child(i);
    if (child.type.name === "html") {
      out += String(child.attrs?.value ?? "");
    } else if (child.isText && child.marks.length === 0) {
      out += escapeHtmlText(child.text ?? "");
    } else if (child.type.name === "hardbreak") {
      out += "\n";
    } else {
      return null;
    }
  }

  const trimmed = out.trim();
  if (!trimmed.startsWith("<") || !trimmed.endsWith(">")) return null;
  return out;
}

/** Scan a ProseMirror document and group raw HTML blocks that form interactive
 *  web widgets (e.g. an HTML container optionally preceded by `<style>` and/or
 *  followed by `<script>`). */
export function collectHtmlWidgetGroups(doc: ProseNode): HtmlWidgetGroup[] {
  const blocks: BlockInfo[] = [];
  doc.forEach((block, pos, index) => {
    const raw = extractRawHtmlFromBlock(block);
    if (raw === null) {
      blocks.push({
        index,
        pos,
        end: pos + block.nodeSize,
        kind: "none",
        raw: "",
        hasEmbeddedScript: false,
        hasEmbeddedStyle: false,
        hasInteractiveControl: false,
        hasRichVisualLayout: false,
      });
      return;
    }
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
    const isWidget =
      hasScript || hasStyle || fragment.hasInteractiveControl || fragment.hasRichVisualLayout;

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

function stripScriptsForStaticHtml(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("script").forEach((el) => el.remove());
  const stack: Element[] = [...template.content.children];
  while (stack.length > 0) {
    const el = stack.pop()!;
    for (const attr of Array.from(el.attributes)) {
      if (
        /^on[a-z]+$/i.test(attr.name) ||
        (/^(?:href|src|xlink:href)$/i.test(attr.name) &&
          /^\s*javascript:/i.test(attr.value))
      ) {
        el.removeAttribute(attr.name);
      }
    }
    for (const child of Array.from(el.children)) stack.push(child);
  }
  const wrapper = document.createElement("div");
  wrapper.appendChild(template.content.cloneNode(true));
  return wrapper.innerHTML;
}

/** Build the sandboxed iframe `srcdoc` document for a widget group.
 *  Static groups (`!group.hasScript`) strip all scripts/handlers and lock CSP
 *  with a per-frame nonce so ONLY the height reporter can execute. */
export function buildWidgetSrcdoc(group: HtmlWidgetGroup, frameId: string): string {
  const nonce = group.hasScript ? "" : crypto.randomUUID().replace(/-/g, "");
  const csp = group.hasScript
    ? "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:;"
    : `default-src 'none'; script-src 'nonce-${nonce}'; script-src-attr 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:;`;
  const safeId = JSON.stringify(frameId);
  const styleBlock = group.styles.join("\n");
  const bodyHtml = group.hasScript ? group.html : stripScriptsForStaticHtml(group.html);
  const scriptBlock = group.hasScript ? group.scripts.join("\n") : "";
  const reporterOpenTag = group.hasScript ? "<script>" : `<script nonce="${nonce}">`;

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
    ":where(table) { width: 100%; border-collapse: collapse; font-size: 14px; }",
    ":where(th, td) { padding: 8px 12px; border: 1px solid #dce6e5; text-align: left; }",
    ":where(th) { background: #f3f6f5; font-weight: 600; }",
    "#__mdmeow_widget_root__ { display: flow-root; padding: 2px; }",
    "</style>",
    styleBlock,
    "</head>",
    "<body>",
    '<div id="__mdmeow_widget_root__">',
    bodyHtml,
    "</div>",
    scriptBlock,
    reporterOpenTag,
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
  if (groups.length === 0) return DecorationSet.empty;

  const decorations: Decoration[] = [];
  for (const group of groups) {
    // Scripted widgets require explicit user approval; static zero-script
    // HTML/SVG cards render safely right away under a nonce-locked CSP.
    if (group.hasScript && !allowed) continue;

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

  return decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
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
  iframe.dataset.mdmeowWidgetId = frameId;
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.setAttribute("referrerpolicy", "no-referrer");
  iframe.setAttribute("title", t("widget.badge"));
  iframe.style.height = "120px";
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
          const sourceVisible = new Set<string>();
          return {
            allowed: false,
            sourceVisible,
            groups,
            decorations: buildWidgetDecorations(state.doc, groups, false, sourceVisible),
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
  // Frames are matched via live DOM attributes; nothing to clear globally.
}
