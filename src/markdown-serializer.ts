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
import { defaultHandlers } from "mdast-util-to-markdown";

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

/**
 * Join adjacent unordered lists before serialization. Otherwise remark's
 * bulletOther choice may mix `*` items into a document configured for `-`.
 */
function mergeAdjacentBulletLists(node: any): void {
  if (!Array.isArray(node.children)) return;
  const combined: any[] = [];
  for (const child of node.children) {
    const previous = combined[combined.length - 1];
    if (
      previous && previous.type === "list" && child.type === "list" &&
      !previous.ordered && !child.ordered
    ) {
      previous.children.push(...child.children);
      previous.spread = Boolean(previous.spread || child.spread);
    } else {
      combined.push(child);
    }
  }
  node.children = combined;
  for (const child of combined) mergeAdjacentBulletLists(child);
}

const rootHandler = (node: any, parent: any, state: any, info: any): string => {
  mergeAdjacentBulletLists(node);
  return (defaultHandlers as any).root(node, parent, state, info);
};

/** Apply MDmeow's serializer preferences to a Milkdown editor context. */
export function configureMarkdownSerializer(ctx: Ctx, marker: ListMarker): void {
  const current = ctx.get(remarkStringifyOptionsCtx) as any;
  ctx.set(remarkStringifyOptionsCtx, {
    ...current,
    bullet: marker,
    bulletOther: marker === "*" ? "-" : "*",
    handlers: {
      ...current.handlers,
      root: rootHandler,
      link: makeMediaHandler(false),
      image: makeMediaHandler(true),
    },
  });
}
