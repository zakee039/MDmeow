// Render a broad, strictly allowlisted subset of raw Markdown HTML as real
// editor content while preserving the original `html` atom nodes for lossless
// Markdown round-tripping.
//
// Supported constructs (zero untrusted innerHTML in the host WebView):
//   * <!-- ... -->                -> hidden HTML comments
//   * <br>, <hr>                  -> line break / divider
//   * <img ...>                   -> real image (local paths resolved via Tauri)
//   * <div|p align>, <center>     -> block alignment (split or single-block) + wrapped images
//   * <details> / <summary>       -> interactive fold (split or single-block)
//   * <a href="...">              -> safe external, anchor, or local link
//   * <kbd>, <sub>, <sup>, <mark>, <u>, <ins>, <small>, <ruby>/<rt>/<rp>, <span style>, <font color>

import { schemaCtx } from "@milkdown/kit/core";
import type { Crepe } from "@milkdown/crepe";
import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { openUrl } from "@tauri-apps/plugin-opener";

/* eslint-disable @typescript-eslint/no-explicit-any */

const MORE_COMMENT = /^<!--\s*more\s*-->$/i;
const HTML_COMMENT = /^<!--(?:(?!-->)[\s\S])*-->$/;
const BR_TAG = /^<br\s*\/?>$/i;
const HR_TAG = /^<hr\b[^>]*\/?>$/i;
const DETAILS_OPEN = /^<details\b([^<>]*)>$/i;
const DETAILS_HEADER = /^(<details\b[^<>]*>)\s*(<summary\b[\s\S]*<\/summary\s*>)$/i;
const DETAILS_CLOSE = /^<\/details\s*>$/i;
const DIV_CLOSE = /^<\/div\s*>$/i;
const P_CLOSE = /^<\/p\s*>$/i;
const CENTER_OPEN = /^<center\s*>$/i;
const CENTER_CLOSE = /^<\/center\s*>$/i;

const INLINE_OPEN_TAG = /^<(kbd|sub|sup|mark|u|ins|small|span|font|a|ruby|rt|rp)\b([^<>]*)>$/i;
const INLINE_CLOSE_TAG = /^<\/(kbd|sub|sup|mark|u|ins|small|span|font|a|ruby|rt|rp)\s*>$/i;

const SAFE_EXTERNAL_HREF = /^(?:https?:|mailto:)/i;
const SCHEME_PREFIX = /^[a-z][a-z0-9+.-]*:/i;
const SAFE_COLOR_VAL = /^(?:#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([0-9.,%\s/+-]+\)|[a-z]{3,24})$/i;

let htmlLinkHandler: ((href: string) => void) | null = null;

export function setHtmlLinkHandler(handler: ((href: string) => void) | null): void {
  htmlLinkHandler = handler;
}

type SafeHtmlKind =
  | "details-open"
  | "details-close"
  | "summary"
  | "div-open"
  | "div-close"
  | "inline-open"
  | "inline-close";

type DomSpec = string | [string, Record<string, string>, ...DomSpec[]];

interface InlineTagInfo {
  tag: string;
  cls?: string;
  style?: string;
  href?: string;
  title?: string;
}

function sanitizeHref(raw: string | null): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  if (SAFE_EXTERNAL_HREF.test(trimmed)) return trimmed;
  if (trimmed.startsWith("#")) return trimmed;
  // Allow relative local paths (no scheme and not protocol-relative //host).
  if (!trimmed.startsWith("//") && !SCHEME_PREFIX.test(trimmed)) return trimmed;
  return null;
}

function sanitizeInlineStyle(raw: string | null): string {
  if (!raw) return "";
  const out: string[] = [];
  for (const decl of raw.split(";")) {
    const colon = decl.indexOf(":");
    if (colon < 0) continue;
    const prop = decl.slice(0, colon).trim().toLowerCase();
    const val = decl.slice(colon + 1).trim();
    if (!val || /url\s*\(|expression\s*\(|javascript:/i.test(val)) continue;

    if (
      (prop === "color" || prop === "background-color" || prop === "background") &&
      SAFE_COLOR_VAL.test(val)
    ) {
      out.push(`${prop}:${val}`);
    } else if (prop === "font-weight" && /^(?:normal|bold|bolder|lighter|[1-9]00)$/i.test(val)) {
      out.push(`${prop}:${val}`);
    } else if (prop === "font-style" && /^(?:normal|italic|oblique)$/i.test(val)) {
      out.push(`${prop}:${val}`);
    } else if (
      prop === "text-decoration" &&
      /^(?:none|underline|line-through|overline)(?:\s+(?:underline|line-through|overline))*$/i.test(val)
    ) {
      out.push(`${prop}:${val}`);
    } else if (prop === "text-align" && /^(?:left|center|right|justify)$/i.test(val)) {
      out.push(`${prop}:${val}`);
    }
  }
  return out.join(";");
}

function parseInlineOpenTag(raw: string): InlineTagInfo | null {
  const m = INLINE_OPEN_TAG.exec(raw.trim());
  if (!m) return null;
  const tag = m[1].toLowerCase();
  const template = document.createElement("template");
  template.innerHTML = raw.trim();
  const el = template.content.firstElementChild;
  if (!el || el.tagName.toLowerCase() !== tag) return null;

  if (tag === "kbd") return { tag, cls: "mdmeow-kbd" };
  if (tag === "sub") return { tag, cls: "mdmeow-sub" };
  if (tag === "sup") return { tag, cls: "mdmeow-sup" };
  if (tag === "mark") return { tag, cls: "mdmeow-mark" };
  if (tag === "u" || tag === "ins") return { tag, cls: "mdmeow-underline" };
  if (tag === "small") return { tag, cls: "mdmeow-small" };
  if (tag === "ruby") return { tag, cls: "mdmeow-ruby" };
  if (tag === "rt") return { tag, cls: "mdmeow-rt" };
  if (tag === "rp") return { tag, cls: "mdmeow-rp" };

  if (tag === "font") {
    const color = (el.getAttribute("color") ?? "").trim();
    const style = color && SAFE_COLOR_VAL.test(color) ? `color:${color}` : "";
    return style ? { tag, style } : null;
  }

  if (tag === "span") {
    const style = sanitizeInlineStyle(el.getAttribute("style"));
    return style ? { tag, style } : null;
  }

  if (tag === "a") {
    const href = sanitizeHref(el.getAttribute("href"));
    if (!href) return null;
    const title = (el.getAttribute("title") ?? "").trim() || undefined;
    return { tag, cls: "mdmeow-html-link", href, title };
  }

  return null;
}

function parseInlineCloseTag(raw: string): string | null {
  const m = INLINE_CLOSE_TAG.exec(raw.trim());
  return m ? m[1].toLowerCase() : null;
}

function inlineTagDecorations(doc: ProseNode): Decoration[] {
  const results: Decoration[] = [];
  const openByParent = new Map<ProseNode, Array<{ pos: number; info: InlineTagInfo }>>();

  doc.descendants((node, pos, parent) => {
    if (node.type.name !== "html" || !parent) return;
    const value = String(node.attrs?.value ?? "").trim();
    const openInfo = parseInlineOpenTag(value);
    if (openInfo) {
      const stack = openByParent.get(parent) ?? [];
      stack.push({ pos: pos + node.nodeSize, info: openInfo });
      openByParent.set(parent, stack);
      return;
    }

    const closeTag = parseInlineCloseTag(value);
    if (!closeTag) return;
    const stack = openByParent.get(parent);
    if (!stack?.length) return;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].info.tag !== closeTag) continue;
      const [{ pos: from, info }] = stack.splice(i, 1);
      if (from < pos) {
        const attrs: Record<string, string> = {};
        if (info.cls) attrs.class = info.cls;
        if (info.style) attrs.style = info.style;
        if (info.href) {
          attrs["data-mdmeow-href"] = info.href;
          attrs.title = info.title ? `${info.title} (${info.href})` : info.href;
          attrs.role = "link";
          attrs.tabindex = "0";
        }
        if (Object.keys(attrs).length > 0) {
          results.push(Decoration.inline(from, pos, attrs));
        }
      }
      break;
    }
  });

  return results;
}

const presentationKey = new PluginKey<{ toggled: Set<number>; decorations: DecorationSet }>("mdmeow-html");

function structuralDecorations(doc: ProseNode, toggled: Set<number>): DecorationSet {
  const decorations = inlineTagDecorations(doc);
  const blocks: { pos: number; end: number }[] = [];
  const folds: { start: number; summary: number; expanded: boolean }[] = [];
  const aligns: { start: number; align: string; closeTag: "div" | "p" | "center" }[] = [];
  const blockLinks: { start: number; href: string; title?: string }[] = [];

  function decorateBlock(index: number, cls: string): void {
    const { pos, end } = blocks[index];
    decorations.push(Decoration.node(pos, end, { class: cls }));
  }

  doc.forEach((block, pos, index) => {
    blocks.push({ pos, end: pos + block.nodeSize });
    const atom = block.firstChild;
    if (block.childCount !== 1 || atom?.type.name !== "html") return;
    const raw = String(atom.attrs.value).trim();

    if (doc.childCount > 1 && HTML_COMMENT.test(raw)) {
      decorateBlock(index, "mdmeow-html-marker-block");
      return;
    }

    const header = DETAILS_HEADER.exec(raw);
    const open = DETAILS_OPEN.exec(header?.[1] ?? raw);
    if (open) {
      const template = document.createElement("template");
      template.innerHTML = open[0];
      folds.push({
        start: index,
        summary: header ? index : -1,
        expanded: template.content.firstElementChild?.hasAttribute("open") ?? false,
      });
      return;
    }
    const fold = folds[folds.length - 1];
    if (fold && fold.summary < 0 && parseSummary(raw) !== null) fold.summary = index;
    if (fold && DETAILS_CLOSE.test(raw)) {
      folds.pop();
      if (fold.summary < 0) return;
      if (fold.start !== fold.summary) decorateBlock(fold.start, "mdmeow-html-marker-block");
      decorateBlock(index, "mdmeow-html-marker-block");
      const summary = blocks[fold.summary];
      const atomPos = summary.pos + 1;
      const expanded = fold.expanded !== toggled.has(atomPos);
      decorations.push(Decoration.node(atomPos, summary.end - 1, {
        class: expanded ? "mdmeow-details-summary mdmeow-details-expanded" : "mdmeow-details-summary",
        "aria-expanded": String(expanded),
        "data-mdmeow-fold": String(atomPos),
      }));
      if (!expanded) {
        for (let i = fold.summary + 1; i < index; i++) decorateBlock(i, "mdmeow-details-collapsed");
      }
      return;
    }

    const alignInfo = parseBlockAlignOpen(raw);
    if (alignInfo) {
      aligns.push({ start: index, align: alignInfo.align, closeTag: alignInfo.tag });
      return;
    }
    const closeAlignTag = DIV_CLOSE.test(raw)
      ? "div"
      : P_CLOSE.test(raw)
        ? "p"
        : CENTER_CLOSE.test(raw)
          ? "center"
          : null;
    if (closeAlignTag) {
      for (let k = aligns.length - 1; k >= 0; k--) {
        if (aligns[k].closeTag !== closeAlignTag) continue;
        const [range] = aligns.splice(k, 1);
        decorateBlock(range.start, "mdmeow-html-marker-block");
        decorateBlock(index, "mdmeow-html-marker-block");
        for (let i = range.start + 1; i < index; i++) {
          decorateBlock(i, "mdmeow-html-align-" + range.align);
        }
        break;
      }
      return;
    }

    // Split <a href="...">\n\nlink text\n\n</a> across blocks (Case 10B)
    const linkOpen = parseInlineOpenTag(raw);
    if (linkOpen?.tag === "a" && linkOpen.href) {
      blockLinks.push({ start: index, href: linkOpen.href, title: linkOpen.title });
      return;
    }
    if (parseInlineCloseTag(raw) === "a" && blockLinks.length > 0) {
      const range = blockLinks.pop()!;
      decorateBlock(range.start, "mdmeow-html-marker-block");
      decorateBlock(index, "mdmeow-html-marker-block");
      for (let i = range.start + 1; i < index; i++) {
        const b = blocks[i];
        decorations.push(
          Decoration.node(b.pos, b.end, {
            class: "mdmeow-html-link",
            "data-mdmeow-href": range.href,
            title: range.title ? `${range.title} (${range.href})` : range.href,
          }),
        );
      }
    }
  });
  return DecorationSet.create(doc, decorations);
}

function toggleDetails(view: EditorView, event: Event): boolean {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return false;

  const summary = target.closest<HTMLElement>("[data-mdmeow-fold]");
  if (summary) {
    event.preventDefault();
    view.dispatch(view.state.tr.setMeta(presentationKey, Number(summary.dataset.mdmeowFold)));
    return true;
  }

  const link = target.closest<HTMLElement>("[data-mdmeow-href]");
  if (link) {
    const href = sanitizeHref(link.dataset.mdmeowHref ?? null);
    if (!href) return false;
    event.preventDefault();
    if (htmlLinkHandler) htmlLinkHandler(href);
    else if (SAFE_EXTERNAL_HREF.test(href)) void openUrl(href);
    return true;
  }

  return false;
}

export const safeHtmlPresentationPlugin = $prose(() => new Plugin({
  key: presentationKey,
  state: {
    init: (_, state) => ({ toggled: new Set<number>(), decorations: structuralDecorations(state.doc, new Set()) }),
    apply(tr, previous) {
      const target: number | undefined = tr.getMeta(presentationKey);
      if (!tr.docChanged && target === undefined) return previous;
      const toggled = new Set<number>();
      for (const pos of previous.toggled) {
        const mapped = tr.mapping.mapResult(pos);
        if (!mapped.deleted) toggled.add(mapped.pos);
      }
      if (target !== undefined) {
        if (toggled.has(target)) toggled.delete(target);
        else toggled.add(target);
      }
      return { toggled, decorations: structuralDecorations(tr.doc, toggled) };
    },
  },
  props: {
    decorations: (state) => presentationKey.getState(state)?.decorations,
    handleDOMEvents: {
      click: toggleDetails,
      keydown: (view, event) => (event.key === "Enter" || event.key === " ") && toggleDetails(view, event),
    },
  },
}));

interface RawImageAttrs {
  src: string;
  alt?: string;
  title?: string;
  width?: string;
  height?: string;
  align?: string;
  zoom?: string;
}

function extractImageAttrs(el: HTMLImageElement): RawImageAttrs | null {
  const src = (el.getAttribute("src") ?? "").trim();
  if (!src) return null;

  const attrs: RawImageAttrs = { src };
  const alt = el.getAttribute("alt");
  const title = el.getAttribute("title");
  const width = el.getAttribute("width");
  const height = el.getAttribute("height");
  const align = el.getAttribute("data-align") ?? el.getAttribute("align");

  if (alt) attrs.alt = alt;
  if (title) attrs.title = title;
  if (width && /^\d+(?:\.\d+)?(?:px|%)?$/.test(width.trim())) attrs.width = width.trim();
  if (height && /^\d+(?:\.\d+)?(?:px|%)?$/.test(height.trim())) attrs.height = height.trim();
  if (align && /^(left|center|right)$/i.test(align.trim())) attrs.align = align.trim().toLowerCase();

  const style = el.getAttribute("style") ?? "";
  const zoom = style.match(/(?:^|;)\s*zoom\s*:\s*([0-9]+(?:\.[0-9]+)?%?)/i)?.[1];
  if (zoom) attrs.zoom = zoom;

  return attrs;
}

function parseRawImage(value: string): RawImageAttrs | null {
  const trimmed = value.trim();
  if (!/^<img\b/i.test(trimmed)) return null;

  const template = document.createElement("template");
  template.innerHTML = trimmed;
  const meaningful = [...template.content.childNodes].filter(
    (node) => node.nodeType !== Node.TEXT_NODE || Boolean(node.textContent?.trim()),
  );
  if (meaningful.length !== 1) return null;
  const el = meaningful[0];
  if (!(el instanceof HTMLImageElement)) return null;
  return extractImageAttrs(el);
}

export interface RawHtmlImagePresentation {
  align: "left" | "center" | "right";
  ratio: number;
  title: string;
}

/** Read the presentation metadata used by the shared image toolbar without
 * converting the underlying raw-HTML node into a Markdown image node. */
export function rawHtmlImagePresentation(
  value: string,
): RawHtmlImagePresentation | null {
  const image = parseRawImage(value);
  if (!image) return null;

  const zoom = Number.parseFloat(String(image.zoom ?? "100").replace("%", ""));
  const ratio = Number.isFinite(zoom) && zoom > 0
    ? (String(image.zoom ?? "").includes("%") ? zoom / 100 : zoom)
    : 1;

  return {
    align:
      image.align === "left" || image.align === "right"
        ? image.align
        : "center",
    ratio,
    title: image.title ?? "",
  };
}

export function buildRawHtmlImage(options: {
  src: string;
  alt?: string;
  title?: string;
  align?: RawHtmlImagePresentation["align"];
  ratio?: number;
}): string {
  const el = document.createElement("img");
  el.setAttribute("title", options.title ?? "");
  el.setAttribute("src", options.src);
  el.setAttribute("alt", options.alt ?? "");

  const ratio = Math.max(0.01, options.ratio ?? 1);
  if (Math.abs(ratio - 1) >= 0.0001) {
    el.style.setProperty("zoom", `${Math.round(ratio * 10000) / 100}%`);
  }
  el.setAttribute("data-align", options.align ?? "center");
  return el.outerHTML;
}

/** Update the editable metadata of a raw HTML <img>. The document continues to
 * round-trip as ordinary HTML compatible with Typedown-style image markup. */
export function updateRawHtmlImagePresentation(
  value: string,
  patch: Partial<RawHtmlImagePresentation>,
): string | null {
  const trimmed = value.trim();
  if (!parseRawImage(trimmed)) return null;

  const template = document.createElement("template");
  template.innerHTML = trimmed;
  const el = template.content.firstElementChild;
  if (!(el instanceof HTMLImageElement)) return null;

  // Never emit MDmeow-private source attributes. The runtime-only
  // data-mdmeow-html-img marker is added by toDOM and is not serialized.
  el.removeAttribute("data-mdmeow-image");
  if (!el.hasAttribute("title")) el.setAttribute("title", "");
  if (!el.hasAttribute("alt")) el.setAttribute("alt", "");

  if (patch.align) {
    el.setAttribute("data-align", patch.align);
    // Prefer our non-deprecated data attribute after the first toolbar edit.
    el.removeAttribute("align");
  }

  if (patch.ratio !== undefined) {
    const ratio = Math.max(0.01, patch.ratio);
    const style = el.style;
    if (Math.abs(ratio - 1) < 0.0001) style.removeProperty("zoom");
    else style.setProperty("zoom", `${Math.round(ratio * 10000) / 100}%`);
    if (!style.cssText.trim()) el.removeAttribute("style");
  }

  if (patch.title !== undefined) {
    el.setAttribute("title", patch.title);
  }

  return el.outerHTML;
}

function buildImgSpec(image: RawImageAttrs, inlineInContainer: boolean, rootAttrs?: Record<string, string>): [string, Record<string, string>] {
  const attrs: Record<string, string> = {
    src: image.src,
    "data-mdmeow-html-img": "true",
    "data-mdmeow-src": image.src,
    ...(rootAttrs ?? {}),
  };
  if (image.alt) attrs.alt = image.alt;
  if (image.title) attrs.title = image.title;
  if (image.width) attrs.width = image.width;
  if (image.height) attrs.height = image.height;
  if (image.align) attrs["data-align"] = image.align;

  const styles: string[] = ["max-width:100%", "height:auto"];
  if (image.zoom) styles.push(`zoom:${image.zoom}`);
  if (!inlineInContainer) {
    if (image.align === "center") styles.push("display:block", "margin-left:auto", "margin-right:auto");
    else if (image.align === "right") styles.push("display:block", "margin-left:auto");
    else if (image.align === "left") styles.push("display:block", "margin-right:auto");
  } else {
    styles.push("vertical-align:middle");
  }
  attrs.style = styles.join(";");

  return ["img", attrs];
}

function rawImageDom(value: string, image: RawImageAttrs): [string, Record<string, string>] {
  return buildImgSpec(image, false, {
    "data-type": "html",
    "data-value": value,
  });
}

function safeMarkerDom(
  value: string,
  kind: SafeHtmlKind,
  extra: Record<string, string> = {},
): [string, Record<string, string>, string] {
  return [
    "span",
    {
      "data-type": "html",
      "data-value": value,
      "data-mdmeow-safe-html": kind,
      ...extra,
    },
    "",
  ];
}

function parseBlockAlignOpen(value: string): { tag: "div" | "p" | "center"; align: "left" | "center" | "right" } | null {
  const trimmed = value.trim();
  if (CENTER_OPEN.test(trimmed)) return { tag: "center", align: "center" };
  const match = /^<(div|p)\b[^>]*>$/i.exec(trimmed);
  if (!match) return null;
  const tag = match[1].toLowerCase() as "div" | "p";
  const template = document.createElement("template");
  template.innerHTML = trimmed;
  const el = template.content.firstElementChild;
  if (!el || el.tagName.toLowerCase() !== tag) return null;
  const align = (el.getAttribute("align") ?? "").trim().toLowerCase();
  return align === "left" || align === "center" || align === "right"
    ? { tag, align }
    : null;
}

function parseSummary(value: string): string | null {
  const trimmed = value.trim();
  if (!/^<summary\b[^>]*>[\s\S]*<\/summary\s*>$/i.test(trimmed)) return null;
  const template = document.createElement("template");
  template.innerHTML = trimmed;
  const meaningful = [...template.content.childNodes].filter(
    (node) => node.nodeType !== Node.TEXT_NODE || Boolean(node.textContent?.trim()),
  );
  if (meaningful.length !== 1) return null;
  const summary = meaningful[0];
  if (!(summary instanceof HTMLElement) || summary.tagName !== "SUMMARY") return null;
  return summary.textContent ?? "";
}

const ALLOWED_SIMPLE_TAGS = new Set([
  "div",
  "p",
  "center",
  "span",
  "strong",
  "b",
  "em",
  "i",
  "code",
  "br",
  "small",
  "sub",
  "sup",
  "mark",
  "u",
  "ins",
  "del",
  "s",
  "kbd",
  "font",
  "img",
  "a",
  "details",
  "summary",
  "ruby",
  "rt",
  "rp",
]);

/** Convert a simple, script-free HTML node tree into an allowlisted ProseMirror
 *  DOMOutputSpec. Returns null if the tree contains any complex/unlisted tag
 *  so complex widgets/cards are handled by html-widget.ts instead. */
function convertSafeSubtree(node: Node): DomSpec | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }
  if (node.nodeType === Node.COMMENT_NODE) return "";
  if (!(node instanceof Element)) return null;

  const tag = node.tagName.toLowerCase();
  if (!ALLOWED_SIMPLE_TAGS.has(tag)) return null;
  for (const attr of Array.from(node.attributes)) {
    if (/^on[a-z]+$/i.test(attr.name)) return null;
  }

  if (tag === "br") return ["br", {}];
  if (tag === "img") {
    const img = extractImageAttrs(node as HTMLImageElement);
    return img ? buildImgSpec(img, true) : null;
  }

  const children: DomSpec[] = [];
  for (const child of Array.from(node.childNodes)) {
    const converted = convertSafeSubtree(child);
    if (converted === null) return null;
    if (converted !== "") children.push(converted);
  }

  if (tag === "a") {
    const href = sanitizeHref(node.getAttribute("href"));
    if (!href) return null;
    const title = (node.getAttribute("title") ?? "").trim();
    const attrs: Record<string, string> = {
      class: "mdmeow-html-link",
      "data-mdmeow-href": href,
      role: "link",
      tabindex: "0",
      title: title ? `${title} (${href})` : href,
    };
    return ["span", attrs, ...children];
  }

  if (tag === "center") {
    return ["span", { class: "mdmeow-html-inline-block mdmeow-html-align-center" }, ...children];
  }

  if (tag === "div" || tag === "p") {
    const align = (node.getAttribute("align") ?? "").trim().toLowerCase();
    const cls =
      align === "left" || align === "center" || align === "right"
        ? `mdmeow-html-inline-block mdmeow-html-align-${align}`
        : "mdmeow-html-inline-block";
    return ["span", { class: cls }, ...children];
  }

  if (tag === "details") {
    const attrs: Record<string, string> = { class: "mdmeow-html-details-card" };
    if (node.hasAttribute("open")) attrs.open = "";
    return ["details", attrs, ...children];
  }

  if (tag === "summary") {
    return ["summary", { class: "mdmeow-html-details-summary" }, ...children];
  }

  const attrs: Record<string, string> = {};
  if (tag === "kbd") attrs.class = "mdmeow-kbd";
  else if (tag === "mark") attrs.class = "mdmeow-mark";
  else if (tag === "sub") attrs.class = "mdmeow-sub";
  else if (tag === "sup") attrs.class = "mdmeow-sup";
  else if (tag === "u" || tag === "ins") attrs.class = "mdmeow-underline";
  else if (tag === "small") attrs.class = "mdmeow-small";
  else if (tag === "ruby") attrs.class = "mdmeow-ruby";
  else if (tag === "rt") attrs.class = "mdmeow-rt";
  else if (tag === "rp") attrs.class = "mdmeow-rp";
  else if (tag === "span") {
    const style = sanitizeInlineStyle(node.getAttribute("style"));
    if (style) attrs.style = style;
  } else if (tag === "font") {
    const color = (node.getAttribute("color") ?? "").trim();
    if (color && SAFE_COLOR_VAL.test(color)) attrs.style = `color:${color}`;
  }

  const outTag = tag === "ins" ? "u" : tag === "font" ? "span" : tag;
  return [outTag, attrs, ...children];
}

/** Render complete single-block simple HTML constructs (e.g. `<div align="center"><img ...></div>`,
 *  `<a href="...">...</a>`, `<details><summary>...</summary><p>...</p></details>`,
 *  `<center>...</center>`) safely while leaving rich styled visual cards & scripted
 *  widgets for `html-widget.ts`. */
function parseSimpleCompleteHtml(value: string): [string, Record<string, string>, ...DomSpec[]] | null {
  const trimmed = value.trim();
  if (!/^<(?:div|p|center|a|details|kbd|sub|sup|mark|u|ins|small|span|font|ruby)\b/i.test(trimmed)) {
    return null;
  }
  // Must have a closing tag (not a bare split opening tag).
  if (!/<\/[a-z][a-z0-9-]*\s*>$/i.test(trimmed)) return null;

  const template = document.createElement("template");
  template.innerHTML = trimmed;
  const meaningful = Array.from(template.content.childNodes).filter(
    (n) => n.nodeType !== Node.COMMENT_NODE && (n.nodeType !== Node.TEXT_NODE || Boolean(n.textContent?.trim())),
  );
  if (meaningful.length !== 1 || !(meaningful[0] instanceof Element)) return null;

  const root = meaningful[0];
  const rootTag = root.tagName.toLowerCase();

  // Defer rich styled visual cards (inline box/flex/grid/border styles on div)
  // to html-widget.ts so they get full sandboxed CSS fidelity.
  if (rootTag === "div" && root.hasAttribute("style")) return null;
  if (template.content.querySelector("script, style, svg, table, input, button, select, textarea, output, canvas")) {
    return null;
  }

  const spec = convertSafeSubtree(root);
  if (!spec || typeof spec === "string") return null;

  const [specTag, specAttrs, ...specChildren] = spec;
  const isBlockLike = rootTag === "div" || rootTag === "p" || rootTag === "center" || rootTag === "details";
  return [
    specTag,
    {
      ...specAttrs,
      "data-type": "html",
      "data-value": value,
      "data-mdmeow-safe-html": isBlockLike ? "block" : "inline",
      contenteditable: "false",
    },
    ...specChildren,
  ];
}

function safeHtmlDom(value: string, original?: string): DomSpec | null {
  const trimmed = value.trim();
  if (original !== undefined) {
    return ["span", {
      "data-type": "html",
      "data-value": value,
      "data-mdmeow-parse-error": "true",
      contenteditable: "false",
    }, original];
  }
  if (HR_TAG.test(trimmed)) {
    return ["hr", {
      "data-type": "html",
      "data-value": value,
      "data-mdmeow-safe-html": "hr",
    }];
  }
  if (DETAILS_OPEN.test(trimmed)) return safeMarkerDom(value, "details-open");
  if (DETAILS_CLOSE.test(trimmed)) return safeMarkerDom(value, "details-close");
  if (DIV_CLOSE.test(trimmed) || P_CLOSE.test(trimmed) || CENTER_CLOSE.test(trimmed)) {
    return safeMarkerDom(value, "div-close");
  }

  const align = parseBlockAlignOpen(trimmed);
  if (align) return safeMarkerDom(value, "div-open", { "data-mdmeow-align": align.align });

  const summary = parseSummary(DETAILS_HEADER.exec(trimmed)?.[2] ?? trimmed);
  if (summary !== null) {
    return [
      "span",
      {
        "data-type": "html",
        "data-value": value,
        "data-mdmeow-safe-html": "summary",
        role: "button",
        tabindex: "0",
        contenteditable: "false",
        "aria-expanded": "false",
      },
      summary,
    ];
  }

  // Complete single-block safe HTML (e.g. `<div align="center"><img ...></div>`,
  // `<a href="...">...</a>`, `<details><summary>...</summary><p>...</p></details>`).
  const complete = parseSimpleCompleteHtml(value);
  if (complete) return complete;

  // Paired inline HTML tags split around Markdown text (e.g. `<kbd>Ctrl</kbd>`,
  // `H<sub>2</sub>O`, `<mark>text</mark>`, `<a href="...">text</a>`).
  if (parseInlineOpenTag(trimmed)) return safeMarkerDom(value, "inline-open");
  if (parseInlineCloseTag(trimmed)) return safeMarkerDom(value, "inline-close");

  return null;
}

/** Patch Milkdown's existing `html` schema after Crepe has created it. */
export function patchHtmlMarkdown(crepe: Crepe, protectedText: (token: string) => string | undefined): void {
  crepe.editor.action((ctx) => {
    const spec = (ctx.get(schemaCtx) as any).nodes?.html?.spec;
    if (!spec?.toDOM) return;

    const fallbackToDom = spec.toDOM.bind(spec);
    spec.toDOM = (node: any) => {
      const value = String(node.attrs?.value ?? "");
      const trimmed = value.trim();
      if (HTML_COMMENT.test(trimmed)) {
        return [
          "span",
          {
            "data-type": "html",
            "data-value": value,
            "data-mdmeow-hidden-html": MORE_COMMENT.test(trimmed) ? "more" : "comment",
            "aria-hidden": "true",
          },
        ];
      }

      const image = parseRawImage(value);
      if (BR_TAG.test(trimmed)) {
        return [
          "br",
          {
            "data-type": "html",
            "data-value": value,
            "data-mdmeow-html-br": "true",
          },
        ];
      }
      if (image) return rawImageDom(value, image);
      const safeHtml = safeHtmlDom(value, protectedText(value.trim()));
      if (safeHtml) return safeHtml;
      return fallbackToDom(node);
    };

    const parseDOM = Array.isArray(spec.parseDOM) ? spec.parseDOM : [];
    spec.parseDOM = [
      {
        tag: 'br[data-mdmeow-html-br="true"]',
        getAttrs: (dom: HTMLElement) => ({ value: dom.dataset.value ?? "<br>" }),
      },
      {
        tag: 'hr[data-mdmeow-safe-html="hr"]',
        getAttrs: (dom: HTMLElement) => ({ value: dom.dataset.value ?? "<hr>" }),
      },
      {
        tag: 'img[data-type="html"][data-mdmeow-html-img="true"]',
        getAttrs: (dom: HTMLElement) => ({ value: dom.dataset.value ?? "" }),
      },
      {
        tag: 'details[data-type="html"][data-mdmeow-safe-html="block"]',
        getAttrs: (dom: HTMLElement) => ({ value: dom.dataset.value ?? "" }),
      },
      {
        tag: "span[data-mdmeow-hidden-html]",
        getAttrs: (dom: HTMLElement) => ({ value: dom.dataset.value ?? "<!--more-->" }),
      },
      ...parseDOM,
    ];
  });
}

/** Resolve local paths used by raw HTML images through the same Tauri bridge as
 * standard Markdown images. Remote/data/blob URLs pass straight through. */
export function resolveRawHtmlImages(
  host: HTMLElement,
  resolver: (src: string) => string | Promise<string>,
): void {
  requestAnimationFrame(() => {
    host.querySelectorAll<HTMLImageElement>('img[data-mdmeow-html-img="true"]').forEach((img) => {
      const raw = img.dataset.mdmeowSrc ?? img.getAttribute("src") ?? "";
      if (!raw || img.dataset.mdmeowResolvedFor === raw) return;
      img.dataset.mdmeowResolvedFor = raw;
      Promise.resolve(resolver(raw))
        .then((resolved) => {
          if (img.isConnected && resolved) img.src = resolved;
        })
        .catch(() => undefined);
    });
  });
}
