// Render a small, safe subset of raw Markdown HTML as real editor content while
// preserving the original HTML node for Markdown round-tripping.
//
// Milkdown's default HTML node deliberately displays raw HTML as literal text.
// For MDmeow we special-case two common authoring constructs:
//   * <img ...>          -> render as an actual image, preserving the raw HTML.
//   * <!--more-->        -> keep in the document, but hide it in WYSIWYG mode.

import { schemaCtx } from "@milkdown/kit/core";
import type { Crepe } from "@milkdown/crepe";
import { $prose } from "@milkdown/kit/utils";
import { Plugin } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";

/* eslint-disable @typescript-eslint/no-explicit-any */

const MORE_COMMENT = /^<!--\s*more\s*-->$/i;
const DETAILS_OPEN = /^<details\s*>$/i;
const DETAILS_CLOSE = /^<\/details\s*>$/i;
const DIV_CLOSE = /^<\/div\s*>$/i;
const KBD_OPEN = /^<kbd\s*>$/i;
const KBD_CLOSE = /^<\/kbd\s*>$/i;

type SafeHtmlKind =
  | "details-open"
  | "details-close"
  | "summary"
  | "div-open"
  | "div-close"
  | "kbd-open"
  | "kbd-close";

function kbdDecorations(doc: ProseNode): DecorationSet {
  const ranges: Array<{ from: number; to: number }> = [];
  const openByParent = new Map<ProseNode, number[]>();

  doc.descendants((node, pos, parent) => {
    if (node.type.name !== "html" || !parent) return;
    const value = String(node.attrs?.value ?? "").trim();
    if (KBD_OPEN.test(value)) {
      const stack = openByParent.get(parent) ?? [];
      stack.push(pos + node.nodeSize);
      openByParent.set(parent, stack);
      return;
    }
    if (!KBD_CLOSE.test(value)) return;
    const stack = openByParent.get(parent);
    const from = stack?.pop();
    if (from !== undefined && from < pos) ranges.push({ from, to: pos });
  });

  return DecorationSet.create(
    doc,
    ranges.map(({ from, to }) =>
      Decoration.inline(from, to, { class: "mdmeow-kbd" }),
    ),
  );
}

export const safeHtmlPresentationPlugin = $prose(
  () =>
    new Plugin({
      state: {
        init: (_, state) => kbdDecorations(state.doc),
        apply(tr, previous) {
          return tr.docChanged ? kbdDecorations(tr.doc) : previous;
        },
      },
      props: {
        decorations(state) {
          return this.getState(state) ?? DecorationSet.empty;
        },
      },
    }),
);

interface RawImageAttrs {
  src: string;
  alt?: string;
  title?: string;
  width?: string;
  height?: string;
  align?: string;
  zoom?: string;
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

function rawImageDom(value: string, image: RawImageAttrs): [string, Record<string, string>] {
  const attrs: Record<string, string> = {
    src: image.src,
    "data-type": "html",
    "data-value": value,
    "data-mdmeow-html-img": "true",
    "data-mdmeow-src": image.src,
  };
  if (image.alt) attrs.alt = image.alt;
  if (image.title) attrs.title = image.title;
  if (image.width) attrs.width = image.width;
  if (image.height) attrs.height = image.height;
  if (image.align) attrs["data-align"] = image.align;

  const styles: string[] = ["max-width:100%", "height:auto"];
  if (image.zoom) styles.push(`zoom:${image.zoom}`);
  if (image.align === "center") styles.push("display:block", "margin-left:auto", "margin-right:auto");
  else if (image.align === "right") styles.push("display:block", "margin-left:auto");
  else if (image.align === "left") styles.push("display:block", "margin-right:auto");
  attrs.style = styles.join(";");

  return ["img", attrs];
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

function parseDivAlign(value: string): "left" | "center" | "right" | null {
  const trimmed = value.trim();
  if (!/^<div\b[^>]*>$/i.test(trimmed)) return null;
  const template = document.createElement("template");
  template.innerHTML = trimmed;
  const div = template.content.firstElementChild;
  if (!(div instanceof HTMLDivElement)) return null;
  const align = (div.getAttribute("align") ?? "").trim().toLowerCase();
  return align === "left" || align === "center" || align === "right"
    ? align
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

function safeHtmlDom(value: string): [string, Record<string, string>, string] | null {
  const trimmed = value.trim();
  if (DETAILS_OPEN.test(trimmed)) return safeMarkerDom(value, "details-open");
  if (DETAILS_CLOSE.test(trimmed)) return safeMarkerDom(value, "details-close");
  if (DIV_CLOSE.test(trimmed)) return safeMarkerDom(value, "div-close");
  if (KBD_OPEN.test(trimmed)) return safeMarkerDom(value, "kbd-open");
  if (KBD_CLOSE.test(trimmed)) return safeMarkerDom(value, "kbd-close");

  const align = parseDivAlign(trimmed);
  if (align) return safeMarkerDom(value, "div-open", { "data-mdmeow-align": align });

  const summary = parseSummary(trimmed);
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

  return null;
}

function markerIn(
  block: HTMLElement,
  kind: SafeHtmlKind,
): HTMLElement | null {
  if (block.dataset.mdmeowSafeHtml === kind) return block;
  return block.querySelector<HTMLElement>(`[data-mdmeow-safe-html="${kind}"]`);
}

function hideMarkerOnlyBlock(block: HTMLElement, marker: HTMLElement): void {
  if (block === marker || block.textContent?.trim() === "") {
    block.classList.add("mdmeow-html-marker-block");
  }
}

function applyDivRanges(root: HTMLElement): void {
  const blocks = [...root.children].filter(
    (node): node is HTMLElement => node instanceof HTMLElement,
  );
  const stack: Array<{ index: number; align: string; marker: HTMLElement }> = [];

  blocks.forEach((block, index) => {
    const open = markerIn(block, "div-open");
    if (open) {
      hideMarkerOnlyBlock(block, open);
      stack.push({
        index,
        align: open.dataset.mdmeowAlign ?? "left",
        marker: open,
      });
    }

    const close = markerIn(block, "div-close");
    if (!close || !stack.length) return;
    hideMarkerOnlyBlock(block, close);
    const range = stack.pop();
    if (!range) return;
    for (let i = range.index + 1; i < index; i += 1) {
      blocks[i].classList.add(`mdmeow-html-align-${range.align}`);
    }
  });
}

function setDetailsExpanded(
  blocks: HTMLElement[],
  summaryIndex: number,
  closeIndex: number,
  summary: HTMLElement,
  expanded: boolean,
): void {
  summary.setAttribute("aria-expanded", String(expanded));
  summary.classList.toggle("mdmeow-details-expanded", expanded);
  for (let i = summaryIndex + 1; i < closeIndex; i += 1) {
    blocks[i].classList.toggle("mdmeow-details-collapsed", !expanded);
  }
}

function applyDetailsRanges(root: HTMLElement): void {
  const blocks = [...root.children].filter(
    (node): node is HTMLElement => node instanceof HTMLElement,
  );
  let openIndex = -1;
  let summaryIndex = -1;
  let summary: HTMLElement | null = null;

  blocks.forEach((block, index) => {
    const open = markerIn(block, "details-open");
    if (open) {
      hideMarkerOnlyBlock(block, open);
      openIndex = index;
      summaryIndex = -1;
      summary = null;
      return;
    }

    if (openIndex >= 0 && !summary) {
      const candidate = markerIn(block, "summary");
      if (candidate) {
        summary = candidate;
        summaryIndex = index;
        candidate.classList.add("mdmeow-details-summary");
      }
    }

    const close = markerIn(block, "details-close");
    if (!close || openIndex < 0) return;
    hideMarkerOnlyBlock(block, close);

    if (summary && summaryIndex >= 0) {
      const currentSummary = summary;
      const currentSummaryIndex = summaryIndex;
      const closeIndex = index;
      const expanded = currentSummary.getAttribute("aria-expanded") === "true";
      setDetailsExpanded(
        blocks,
        currentSummaryIndex,
        closeIndex,
        currentSummary,
        expanded,
      );

      currentSummary.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        const next = currentSummary.getAttribute("aria-expanded") !== "true";
        setDetailsExpanded(
          blocks,
          currentSummaryIndex,
          closeIndex,
          currentSummary,
          next,
        );
      };
      currentSummary.onkeydown = (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        currentSummary.click();
      };
    }

    openIndex = -1;
    summaryIndex = -1;
    summary = null;
  });
}

/** Apply the visual semantics for the safe structural HTML subset without
 * changing the ProseMirror document. This keeps Markdown round-tripping exact. */
export function refreshSafeRawHtml(host: HTMLElement): void {
  requestAnimationFrame(() => {
    const root = host.querySelector<HTMLElement>(".ProseMirror");
    if (!root) return;

    for (const block of root.querySelectorAll<HTMLElement>(
      ".mdmeow-html-marker-block, .mdmeow-html-align-left, .mdmeow-html-align-center, .mdmeow-html-align-right, .mdmeow-details-collapsed",
    )) {
      block.classList.remove(
        "mdmeow-html-marker-block",
        "mdmeow-html-align-left",
        "mdmeow-html-align-center",
        "mdmeow-html-align-right",
        "mdmeow-details-collapsed",
      );
    }

    applyDivRanges(root);
    applyDetailsRanges(root);
  });
}

/** Patch Milkdown's existing `html` schema after Crepe has created it. */
export function patchHtmlMarkdown(crepe: Crepe): void {
  crepe.editor.action((ctx) => {
    const spec = (ctx.get(schemaCtx) as any).nodes?.html?.spec;
    if (!spec?.toDOM) return;

    const fallbackToDom = spec.toDOM.bind(spec);
    spec.toDOM = (node: any) => {
      const value = String(node.attrs?.value ?? "");
      if (MORE_COMMENT.test(value.trim())) {
        return [
          "span",
          {
            "data-type": "html",
            "data-value": value,
            "data-mdmeow-hidden-html": "more",
            "aria-hidden": "true",
          },
        ];
      }

      const image = parseRawImage(value);
      if (image) return rawImageDom(value, image);
      const safeHtml = safeHtmlDom(value);
      if (safeHtml) return safeHtml;
      return fallbackToDom(node);
    };

    const parseDOM = Array.isArray(spec.parseDOM) ? spec.parseDOM : [];
    spec.parseDOM = [
      {
        tag: 'img[data-mdmeow-html-img="true"]',
        getAttrs: (dom: HTMLElement) => ({ value: dom.dataset.value ?? "" }),
      },
      {
        tag: 'span[data-mdmeow-hidden-html="more"]',
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
      if (!raw) return;
      Promise.resolve(resolver(raw))
        .then((resolved) => {
          if (img.isConnected && resolved) img.src = resolved;
        })
        .catch(() => undefined);
    });
  });
}
