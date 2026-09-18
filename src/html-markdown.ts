// Render a small, safe subset of raw Markdown HTML as real editor content while
// preserving the original HTML node for Markdown round-tripping.
//
// Milkdown's default HTML node deliberately displays raw HTML as literal text.
// For MDmeow we special-case two common authoring constructs:
//   * <img ...>          -> render as an actual image, preserving the raw HTML.
//   * <!--more-->        -> keep in the document, but hide it in WYSIWYG mode.

import { schemaCtx } from "@milkdown/kit/core";
import type { Crepe } from "@milkdown/crepe";

/* eslint-disable @typescript-eslint/no-explicit-any */

const MORE_COMMENT = /^<!--\s*more\s*-->$/i;

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
