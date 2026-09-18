// Tweaks to how Milkdown turns the document back into Markdown text.
//
//  * list marker — `*`, `-` or `+` for bullet lists (user preference)
//  * link / image URLs — Milkdown (via mdast-util-to-markdown) treats a link
//    destination as phrasing content and escapes `&` and character-reference
//    looking runs inside it, so `?a=1&b=2` is written as `?a=1\&b=2`. These
//    replacement handlers emit the destination with a narrowed construct stack
//    (the same trick the upstream autolink handler uses) so ordinary URL
//    characters are left untouched — only `(` `)` and control characters, which
//    would genuinely break a `(...)` destination, are still handled.

import { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";

export type ListMarker = "*" | "-" | "+";

export function isListMarker(v: unknown): v is ListMarker {
  return v === "*" || v === "-" || v === "+";
}

/* eslint-disable @typescript-eslint/no-explicit-any */

const CONTROL_OR_SPACE = /[\u0000-\u0020\u007f]/;

function looksLikeAutolink(node: any): boolean {
  if (node.title || !Array.isArray(node.children) || node.children.length !== 1) {
    return false;
  }
  const child = node.children[0];
  if (!child || child.type !== "text") return false;
  const url: string = node.url ?? "";
  if (!url || /[\s<>]/.test(url)) return false;
  if (child.value === url && /^[A-Za-z][A-Za-z0-9+.-]*:/.test(url)) return true;
  if (url === `mailto:${child.value}` && /^[^@\s]+@[^@\s]+$/.test(child.value)) {
    return true;
  }
  return false;
}

/** Write a link/image destination without phrasing-level escaping. */
function writeDestination(
  url: string,
  state: any,
  tracker: any,
  before: string,
  after: string,
): string {
  const saved = state.stack;
  let out = "";
  if (CONTROL_OR_SPACE.test(url)) {
    // Whitespace / control chars: the destination must use the `<...>` form.
    state.stack = ["destinationLiteral"];
    out += tracker.move("<");
    out += tracker.move(
      state.safe(url, { before: `${before}<`, after: ">", ...tracker.current() }),
    );
    out += tracker.move(">");
  } else {
    state.stack = ["destinationRaw"];
    out += tracker.move(state.safe(url, { before, after, ...tracker.current() }));
  }
  state.stack = saved;
  return out;
}

function makeMediaHandler(image: boolean) {
  const handler = (node: any, _parent: any, state: any, info: any): string => {
    if (!image && looksLikeAutolink(node)) return `<${node.url}>`;

    const tracker = state.createTracker(info);
    const exit = state.enter(image ? "image" : "link");

    let value = tracker.move(image ? "![" : "[");
    const labelExit = state.enter("label");
    if (image) {
      value += tracker.move(
        state.safe(node.alt || "", {
          before: value,
          after: "]",
          ...tracker.current(),
        }),
      );
    } else {
      value += tracker.move(
        state.containerPhrasing(node, {
          before: value,
          after: "](",
          ...tracker.current(),
        }),
      );
    }
    value += tracker.move("](");
    labelExit();

    value += writeDestination(
      node.url ?? "",
      state,
      tracker,
      value,
      node.title ? " " : ")",
    );

    if (node.title) {
      const titleExit = state.enter("titleQuote");
      value += tracker.move(' "');
      value += tracker.move(
        state.safe(node.title, {
          before: value,
          after: '"',
          ...tracker.current(),
        }),
      );
      value += tracker.move('"');
      titleExit();
    }

    value += tracker.move(")");
    exit();
    return value;
  };
  handler.peek = (node: any) =>
    !image && looksLikeAutolink(node) ? "<" : image ? "!" : "[";
  return handler;
}

/** Apply MDmeow's serializer preferences to a Milkdown editor context. */
export function configureMarkdownSerializer(ctx: Ctx, marker: ListMarker): void {
  const current = ctx.get(remarkStringifyOptionsCtx) as any;
  ctx.set(remarkStringifyOptionsCtx, {
    ...current,
    bullet: marker,
    bulletOther: marker === "*" ? "-" : "*",
    handlers: {
      ...current.handlers,
      link: makeMediaHandler(false),
      image: makeMediaHandler(true),
    },
  });
}
