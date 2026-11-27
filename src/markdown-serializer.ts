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

import {
  InitReady,
  remarkPluginsCtx,
  remarkStringifyOptionsCtx,
  schemaCtx,
} from "@milkdown/kit/core";
import { $remark } from "@milkdown/kit/utils";
import type { MilkdownPlugin } from "@milkdown/kit/ctx";
import type { Crepe } from "@milkdown/crepe";
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
    if (!image && looksLikeAutolink(node)) return `<${node.children[0].value}>`;

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

/** Apply MDmeow's serializer preferences to a Milkdown editor context. */
export function configureMarkdownSerializer(ctx: Ctx, getMarker: () => ListMarker): void {
  const current = ctx.get(remarkStringifyOptionsCtx) as any;
  ctx.set(remarkStringifyOptionsCtx, {
    ...current,
    handlers: {
      ...current.handlers,
      root(node: any, parent: any, state: any, info: any) {
        const marker = getMarker();
        state.options.bullet = marker;
        state.options.bulletOther = marker === "*" ? "-" : "*";
        mergeAdjacentBulletLists(node);
        return defaultHandlers.root(node, parent, state, info);
      },
      link: makeMediaHandler(false),
      image: makeMediaHandler(true),
    },
  });
}

/**
 * Milkdown's table cells wrap their content in a `paragraph` node, and its
 * empty-line serializer turns empty paragraphs into `<br />`. That turns a
 * plain empty GFM cell (`| |`) into `| <br /> |`, which both dirties the
 * source on save and triggers a false round-trip failure when opening files
 * containing tables with empty cells.
 */
export function patchTableCellMarkdown(crepe: Crepe): void {
  crepe.editor.action((ctx) => {
    const nodes = (ctx.get(schemaCtx) as any).nodes;
    for (const [name, mdType] of [
      ["table_cell", "tableCell"],
      ["table_header", "tableCell"],
      ["blockquote", "blockquote"],
    ] as const) {
      const spec = nodes?.[name]?.spec;
      const originalRunner = spec?.toMarkdown?.runner;
      if (!originalRunner) continue;
      spec.toMarkdown.runner = (state: any, node: any) => {
        if (
          node.childCount === 1 &&
          node.firstChild?.type.name === "paragraph" &&
          node.firstChild.content.size === 0
        ) {
          state.openNode(mdType).closeNode();
          return;
        }
        originalRunner(state, node);
      };
    }

    const liSpec = nodes?.list_item?.spec;
    const originalLiRunner = liSpec?.toMarkdown?.runner;
    if (originalLiRunner) {
      liSpec.toMarkdown.runner = (state: any, node: any) => {
        if (
          node.attrs?.checked == null &&
          node.childCount === 1 &&
          node.firstChild?.type.name === "paragraph" &&
          node.firstChild.content.size === 0
        ) {
          state.openNode("listItem", undefined, undefined, {
            spread: Boolean(node.attrs?.spread),
          });
          state.openNode("paragraph").closeNode();
          state.closeNode();
          return;
        }
        originalLiRunner(state, node);
      };
    }

    // Preserve genuine fenced ```latex code blocks instead of letting Crepe
    // rewrite them into `$$ ... $$` display-math blocks.
    const cbType = nodes?.code_block;
    const cbSpec = cbType?.spec;
    if (cbType && cbSpec?.parseMarkdown && cbSpec?.toMarkdown) {
      if (!cbType.attrs?.mdmeowFencedLatex) {
        cbSpec.attrs = {
          ...(cbSpec.attrs ?? {}),
          mdmeowFencedLatex: { default: false, validate: "boolean" },
        };
        cbType.attrs.mdmeowFencedLatex = {
          hasDefault: true,
          default: false,
          validate: (v: unknown) => {
            if (typeof v !== "boolean") {
              throw new RangeError("Invalid mdmeowFencedLatex");
            }
          },
        };
        cbType.defaultAttrs = {
          ...(cbType.defaultAttrs ?? {}),
          mdmeowFencedLatex: false,
        };
      }
      const origParse = cbSpec.parseMarkdown.runner;
      cbSpec.parseMarkdown.runner = (state: any, node: any, type: any) => {
        if (node.data?.mdmeowFencedLatex) {
          state.openNode(type, {
            language: node.lang ?? "",
            mdmeowFencedLatex: true,
          });
          if (node.value) state.addText(node.value);
          state.closeNode();
          return;
        }
        origParse(state, node, type);
      };
      const origSerialize = cbSpec.toMarkdown.runner;
      cbSpec.toMarkdown.runner = (state: any, node: any) => {
        if (node.attrs?.mdmeowFencedLatex) {
          state.addNode(
            "code",
            undefined,
            node.content.firstChild?.text || "",
            { lang: node.attrs.language || undefined },
          );
          return;
        }
        origSerialize(state, node);
      };
    }
  });
}

function walkMdastParagraphs(node: any, onParagraph: (p: any) => void): void {
  if (!node || typeof node !== "object") return;
  if (node.type === "paragraph") onParagraph(node);
  if (Array.isArray(node.children)) {
    for (const child of node.children) walkMdastParagraphs(child, onParagraph);
  }
}

function walkMdastCodes(node: any, onCode: (c: any) => void): void {
  if (!node || typeof node !== "object") return;
  if (node.type === "code") onCode(node);
  if (Array.isArray(node.children)) {
    for (const child of node.children) walkMdastCodes(child, onCode);
  }
}

/** Replacement for Milkdown's `remarkPreserveEmptyLinePlugin`: only strip a
 * `<br />` node when it is the *sole* child of an empty paragraph, instead of
 * deleting user-authored `<br>` line breaks inside paragraphs and table cells. */
export const safePreserveEmptyLinePlugin = $remark(
  "remark-preserve-empty-line",
  () => () => (ast: any) => {
    walkMdastParagraphs(ast, (para) => {
      if (
        Array.isArray(para.children) &&
        para.children.length === 1 &&
        para.children[0]?.type === "html" &&
        ["<br />", "<br>", "<br >", "<br/>"].includes(
          String(para.children[0].value ?? "").trim(),
        )
      ) {
        para.children.splice(0, 1);
      }
    });
  },
);

/** Prepend a remark pass ahead of Crepe's `remarkMathBlockPlugin` so real
 * fenced ```` ```latex ```` code blocks are tagged before `math` nodes are
 * converted into `lang: "LaTeX"` code nodes. */
export const markFencedLatexPlugin: MilkdownPlugin = (ctx) => async () => {
  await ctx.wait(InitReady);
  const entry = {
    plugin: () => (ast: any) => {
      walkMdastCodes(ast, (node) => {
        if (typeof node.lang === "string" && node.lang.toLowerCase() === "latex") {
          node.data = { ...(node.data ?? {}), mdmeowFencedLatex: true };
        }
      });
    },
    options: {},
  };
  ctx.update(remarkPluginsCtx, (rp) => [entry, ...rp]);
  return () => {
    ctx.update(remarkPluginsCtx, (rp) => rp.filter((item) => item !== entry));
  };
};
