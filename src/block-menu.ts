// One handle per line: Crepe's "+" add-button is hidden (see styles.css) and the
// remaining drag-dots icon becomes a click target that opens this menu, acting
// on the block next to the handle — turn into / insert / duplicate / delete.
//
// Uses raw ProseMirror commands on the live view (not Milkdown's command
// registry) so it does not depend on cross-package command identity.
import type { Crepe } from "@milkdown/crepe";
import type { Ctx } from "@milkdown/kit/ctx";
import { editorViewCtx } from "@milkdown/kit/core";
import { lift, setBlockType, wrapIn } from "@milkdown/kit/prose/commands";
import { wrapInList, liftListItem } from "@milkdown/kit/prose/schema-list";
import {
  NodeSelection,
  TextSelection,
  type Command,
  type EditorState,
} from "@milkdown/kit/prose/state";
import { canJoin } from "@milkdown/kit/prose/transform";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { Node as ProseNode, NodeType } from "@milkdown/kit/prose/model";

import { t, type I18nKey } from "./i18n";

const LIST_NAMES = ["bullet_list", "ordered_list"];

function listAncestor(state: EditorState):
  | { node: ProseNode; depth: number; pos: number }
  | null {
  const $from = state.selection.$from;
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d);
    if (LIST_NAMES.includes(n.type.name)) {
      return { node: n, depth: d, pos: $from.before(d) };
    }
  }
  return null;
}

function hasAncestorType(state: EditorState, typeName: string): boolean {
  const $from = state.selection.$from;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === typeName) return true;
  }
  return false;
}

interface Target {
  /** A position inside the hovered block, for selection-based commands. */
  textPos: number;
  /** Top-level block boundaries, for structural edits. */
  from: number;
  to: number;
  node: ProseNode;
  /**
   * All top-level blocks covered by a multi-block text selection that
   * overlaps the hovered block, if any. "Turn into" / list actions apply to
   * every block here instead of just the hovered one; structural actions
   * (insert/duplicate/delete/table/…) ignore it and stick to the single
   * hovered block.
   */
  blocks?: { from: number; to: number; node: ProseNode; index: number }[];
  /**
   * Set instead of `blocks` when the hovered target is a whole container —
   * a flat list or a blockquote (see `resolveTarget`: hovering *any* line
   * inside one resolves `node`/`from`/`to` to the container as a whole) —
   * and the selection spans more than one of its children. `anchor` is the
   * container's own start position — the one thing guaranteed to stay valid
   * across the whole conversion, since lifting a child out only ever touches
   * its own position and whatever comes after it. `indices` are the
   * affected children's positions within the container, always processed
   * tail-first so each lift only ever shrinks or splits the container
   * *after* the anchor, never invalidating it.
   */
  containerItems?: { anchor: number; indices: number[] };
}

type Runner = (ctx: Ctx, target: Target) => void;

/** Block types reachable by keyboard shortcut (Ctrl+0..7 — see main.ts). */
export type BlockActionId =
  | "text"
  | "h1"
  | "h2"
  | "h3"
  | "bullet"
  | "ordered"
  | "quote"
  | "code";

interface Item {
  labelKey: I18nKey;
  run: Runner;
  /** Stable key for the keyboard-shortcut layer; menu-only items omit it. */
  id?: BlockActionId;
  /** True when `node` (the top-level block by the handle) is already this type. */
  active?: (node: ProseNode) => boolean;
  /**
   * False for actions that only ever make sense on the single hovered block
   * (insert/duplicate/delete/table/image/divider) — hidden from the menu
   * while a multi-block selection is active, since clicking them would
   * silently act on just one of the selected blocks. Defaults to true.
   */
  multiBlock?: boolean;
}

/** Ctrl/Cmd+0..7 → block id (mirrors `main.ts` `wireShortcuts()`). Shown
 *  right-aligned in the menu so the shortcut is discoverable. */
const SHORTCUT_DIGIT: Record<BlockActionId, number> = {
  text: 0, h1: 1, h2: 2, h3: 3, bullet: 4, ordered: 5, quote: 6, code: 7,
};
const IS_MAC = /Mac|iPhone|iPad/i.test(navigator.platform);
function shortcutHint(id: BlockActionId): string {
  const d = SHORTCUT_DIGIT[id];
  return IS_MAC ? `⌘${d}` : `Ctrl+${d}`;
}

const isType = (name: string) => (n: ProseNode) => n.type.name === name;
const isHeading = (level: number) => (n: ProseNode) =>
  n.type.name === "heading" && n.attrs.level === level;

const node = (view: EditorView, name: string): NodeType => view.state.schema.nodes[name];

function placeCursor(view: EditorView, target: Target): void {
  const pos = Math.min(Math.max(target.textPos, target.from + 1), target.to - 1);
  view.dispatch(
    view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos))),
  );
}

/**
 * Merge adjacent top-level siblings of the same wrapper type after a
 * multi-block conversion, so e.g. three selected paragraphs turned into
 * quotes become one blockquote (matching how Markdown itself has no way to
 * represent three back-to-back blockquotes as distinct from one). Only
 * container types are listed — merging textblocks (heading/paragraph/code)
 * would concatenate their text, which is never what "format the selection"
 * means.
 *
 * Scoped to the touched child-index range: converting a block never adds or
 * removes top-level siblings (wrapping replaces one child with one child),
 * so the original indices of the selected blocks still identify them after
 * the loop. Scanning the whole document instead would risk merging
 * unrelated, pre-existing adjacent blocks elsewhere (e.g. two intentionally
 * separate `> quote` paragraphs) into one.
 */
const MERGEABLE_WRAPPERS = new Set(["bullet_list", "ordered_list", "blockquote"]);

function mergeAdjacentBlocks(
  view: EditorView,
  name: string,
  range: { start: number; end: number },
): void {
  if (!MERGEABLE_WRAPPERS.has(name)) return;
  for (let guard = 0; guard < 64; guard++) {
    const doc = view.state.doc;
    let pos = 0;
    let joinedAt = -1;
    for (let i = 0; i < doc.childCount - 1 && i < range.end; i++) {
      const child = doc.child(i);
      const boundary = pos + child.nodeSize;
      if (i >= range.start) {
        const next = doc.maybeChild(i + 1);
        if (child.type.name === name && next?.type.name === name && canJoin(doc, boundary)) {
          joinedAt = boundary;
          break;
        }
      }
      pos = boundary;
    }
    if (joinedAt < 0) break;
    view.dispatch(view.state.tr.join(joinedAt));
    range.end -= 1; // two siblings became one
  }
}

function indexRange(blocks: { index: number }[]): { start: number; end: number } {
  const indices = blocks.map((b) => b.index);
  return { start: Math.min(...indices), end: Math.max(...indices) };
}

/**
 * Turn one block into a non-list block: first lift it fully out of any list
 * or blockquote wrapper, so e.g. re-quoting an already-quoted line replaces
 * the blockquote instead of nesting a second one inside it, and turning a
 * quoted line into a heading drops the quote rather than leaving it wrapped.
 */
function applyTurnInto(
  view: EditorView,
  make: (view: EditorView) => Command | null,
  target: Target,
): void {
  placeCursor(view, target);

  const li = node(view, "list_item");
  let guard = 0;
  while (guard++ < 16) {
    const before = view.state;
    if (listAncestor(before)) {
      liftListItem(li)(before, view.dispatch, view);
    } else if (hasAncestorType(before, "blockquote")) {
      lift(before, view.dispatch);
    } else {
      break;
    }
    if (view.state === before) break; // the lift was a no-op; stop
  }

  const cmd = make(view);
  if (cmd) cmd(view.state, view.dispatch, view);
}

/**
 * Turn a block (or, for a multi-block selection, every top-level block it
 * covers) into a non-list block. Multi-block conversions run bottom-up: since
 * an edit never shifts positions before it, each not-yet-processed block's
 * original `from`/`to` stays valid right up until it's its own turn.
 */
const turnInto =
  (make: (view: EditorView) => Command | null, mergeName?: string): Runner =>
  (ctx, target) => {
    const view = ctx.get(editorViewCtx);

    const containerItems = target.containerItems;
    if (containerItems && containerItems.indices.length > 1) {
      // Unlike a plain top-level block swap, lifting a child out of a list
      // or blockquote can restructure the *whole* container (splitting it
      // around the lifted child), so a captured from/to can go stale after
      // processing a sibling. Re-resolve fresh from the stable anchor
      // instead — see the `Target.containerItems` doc for why that's safe.
      const ordered = [...containerItems.indices].sort((a, b) => b - a);
      for (const idx of ordered) {
        const container = view.state.doc.resolve(containerItems.anchor + 1).parent;
        let offset = 0;
        for (let k = 0; k < idx; k++) offset += container.child(k).nodeSize;
        const item = container.child(idx);
        const from = containerItems.anchor + 1 + offset;
        const to = from + item.nodeSize;
        applyTurnInto(view, make, { textPos: from + 1, from, to, node: item });
      }
      return;
    }

    const blocks = target.blocks;
    if (blocks && blocks.length > 1) {
      const ordered = [...blocks].sort((a, b) => b.from - a.from);
      for (const b of ordered) {
        applyTurnInto(view, make, { textPos: b.from + 1, from: b.from, to: b.to, node: b.node });
      }
      if (mergeName) mergeAdjacentBlocks(view, mergeName, indexRange(blocks));
      return;
    }
    applyTurnInto(view, make, target);
  };

/**
 * Bullet <-> numbered: retype the surrounding list, or wrap if there is none.
 *
 * The commonmark preset keeps each `list_item`'s `listType`/`label` attrs in
 * sync with its parent list via an `appendTransaction` plugin, and treats a
 * stale `listType: "ordered"` on a bullet list's first child as a sign that
 * the list is *meant* to be ordered — it retypes the list right back. So a
 * bare `setNodeMarkup` on the list here (leaving children stale) gets
 * silently reverted on ordered -> bullet. Flip the immediate children's
 * `listType` (and label, for bullet) in the same transaction so that
 * invariant never breaks.
 *
 * If the block is currently wrapped in a blockquote (not a list), that
 * wrapper is lifted first — otherwise `wrapInList` below would nest a new
 * list *inside* the blockquote instead of replacing it.
 *
 * A `list_item`'s content starts with a `paragraph`, so `wrapInList` on a
 * heading or code block silently fails (`findWrapping` returns null). Flatten
 * any non-paragraph textblock to a paragraph first — "turn this heading into a
 * bullet list" means the heading's text becomes a list item.
 */
function applyToList(view: EditorView, name: string, target: Target): void {
  placeCursor(view, target);

  let guard = 0;
  while (hasAncestorType(view.state, "blockquote") && guard++ < 8) {
    const before = view.state;
    lift(before, view.dispatch);
    if (view.state === before) break;
  }

  const listType = node(view, name);
  const found = listAncestor(view.state);
  if (found) {
    if (found.node.type === listType) return;
    const bullet = name === "bullet_list";
    let tr = view.state.tr.setNodeMarkup(found.pos, listType, null);
    found.node.forEach((child, offset) => {
      if (child.type.name !== "list_item") return;
      tr = tr.setNodeMarkup(found.pos + 1 + offset, undefined, {
        ...child.attrs,
        listType: bullet ? "bullet" : "ordered",
        label: bullet ? "•" : child.attrs.label,
      });
    });
    view.dispatch(tr);
  } else {
    const para = node(view, "paragraph");
    if (view.state.selection.$from.parent.type !== para) {
      setBlockType(para)(view.state, view.dispatch, view);
    }
    wrapInList(listType)(view.state, view.dispatch, view);
  }
}

/**
 * Bullet/numbered list, extended to a multi-block selection: each covered
 * block becomes (or joins) a list, processed bottom-up like `turnInto`, then
 * adjacent same-type lists are merged into one so the result is a single
 * list with one item per selected block rather than N separate one-item
 * lists.
 */
const toList =
  (name: string): Runner =>
  (ctx, target) => {
    const view = ctx.get(editorViewCtx);
    const blocks = target.blocks;
    if (blocks && blocks.length > 1) {
      const ordered = [...blocks].sort((a, b) => b.from - a.from);
      for (const b of ordered) {
        applyToList(view, name, { textPos: b.from + 1, from: b.from, to: b.to, node: b.node });
      }
      mergeAdjacentBlocks(view, name, indexRange(blocks));
      return;
    }
    applyToList(view, name, target);
  };

const structural =
  (fn: (view: EditorView, target: Target) => void): Runner =>
  (ctx, target) =>
    fn(ctx.get(editorViewCtx), target);

const emptyParagraph = (view: EditorView) => node(view, "paragraph").createAndFill()!;

function buildTable(view: EditorView, rows = 3, cols = 3): ProseNode | null {
  const s = view.state.schema.nodes;
  if (!s.table || !s.table_row || !s.table_header_row || !s.table_cell || !s.table_header) {
    return null;
  }
  const headerCells = Array.from({ length: cols }, () => s.table_header.createAndFill()!);
  const bodyCells = Array.from({ length: cols }, () => s.table_cell.createAndFill()!);
  const rowNodes: ProseNode[] = [s.table_header_row.create(null, headerCells)];
  for (let i = 1; i < rows; i++) rowNodes.push(s.table_row.create(null, bodyCells));
  return s.table.create(null, rowNodes);
}

const GROUPS: Item[][] = [
  [
    { labelKey: "block.text", id: "text", run: turnInto((v) => setBlockType(node(v, "paragraph"))), active: isType("paragraph") },
    { labelKey: "block.h1", id: "h1", run: turnInto((v) => setBlockType(node(v, "heading"), { level: 1 })), active: isHeading(1) },
    { labelKey: "block.h2", id: "h2", run: turnInto((v) => setBlockType(node(v, "heading"), { level: 2 })), active: isHeading(2) },
    { labelKey: "block.h3", id: "h3", run: turnInto((v) => setBlockType(node(v, "heading"), { level: 3 })), active: isHeading(3) },
  ],
  [
    { labelKey: "block.bulletList", id: "bullet", run: toList("bullet_list"), active: isType("bullet_list") },
    { labelKey: "block.numberedList", id: "ordered", run: toList("ordered_list"), active: isType("ordered_list") },
    { labelKey: "block.quote", id: "quote", run: turnInto((v) => wrapIn(node(v, "blockquote")), "blockquote"), active: isType("blockquote") },
    { labelKey: "block.codeBlock", id: "code", run: turnInto((v) => setBlockType(node(v, "code_block"))), active: isType("code_block") },
    {
      labelKey: "block.table",
      multiBlock: false,
      run: structural((view, t) => {
        const table = buildTable(view, 3, 3);
        if (!table) return;
        const empty =
          t.node.type.name === "paragraph" && t.node.content.size === 0;
        let tr = view.state.tr;
        if (empty) {
          tr = tr.replaceWith(t.from, t.to, table);
        } else {
          tr = tr.insert(t.to, table);
        }
        const at = empty ? t.from : t.to;
        const sel = TextSelection.near(tr.doc.resolve(at + 1));
        view.dispatch(tr.setSelection(sel).scrollIntoView());
      }),
    },
    {
      labelKey: "block.image",
      active: isType("image-block"),
      multiBlock: false,
      run: structural((view, t) => {
        const type = view.state.schema.nodes["image-block"];
        if (!type) return;
        const img = type.create({ src: "" });
        const empty =
          t.node.type.name === "paragraph" && t.node.content.size === 0;
        const at = empty ? t.from : t.to;
        let tr = empty
          ? view.state.tr.replaceWith(t.from, t.to, img)
          : view.state.tr.insert(t.to, img);
        try {
          tr = tr.setSelection(NodeSelection.create(tr.doc, at));
        } catch {
          /* selecting the new node is best-effort */
        }
        view.dispatch(tr.scrollIntoView());
      }),
    },
    {
      labelKey: "block.divider",
      active: isType("hr"),
      multiBlock: false,
      run: structural((view, t) => {
        const hr = node(view, "hr").create();
        view.dispatch(view.state.tr.insert(t.to, hr).scrollIntoView());
      }),
    },
  ],
  [
    {
      labelKey: "block.insertAbove",
      multiBlock: false,
      run: structural((view, t) => {
        let tr = view.state.tr.insert(t.from, emptyParagraph(view));
        tr = tr.setSelection(TextSelection.near(tr.doc.resolve(t.from + 1)));
        view.dispatch(tr.scrollIntoView());
      }),
    },
    {
      labelKey: "block.insertBelow",
      multiBlock: false,
      run: structural((view, t) => {
        let tr = view.state.tr.insert(t.to, emptyParagraph(view));
        tr = tr.setSelection(TextSelection.near(tr.doc.resolve(t.to + 1)));
        view.dispatch(tr.scrollIntoView());
      }),
    },
    {
      labelKey: "block.duplicate",
      multiBlock: false,
      run: structural((view, t) => {
        view.dispatch(
          view.state.tr.insert(t.to, t.node.copy(t.node.content)).scrollIntoView(),
        );
      }),
    },
    {
      labelKey: "block.delete",
      multiBlock: false,
      run: structural((view, t) => {
        view.dispatch(view.state.tr.delete(t.from, t.to).scrollIntoView());
      }),
    },
  ],
];

/**
 * If the live selection is a range that overlaps `target` and spans more
 * than one top-level block, attach those blocks so "turn into"/list actions
 * can format the whole selection. Only meaningful when `target` itself is a
 * top-level block (not a nested list matched by the depth-preference logic
 * above) — nested-list bulk formatting is out of scope.
 *
 * `sel` is passed in rather than read from `view.state.selection` because by
 * the time this runs, it's already too late to read it live: Milkdown's own
 * block-handle plugin (`@milkdown/plugin-block`'s `BlockService`) collapses
 * the selection into a `NodeSelection` on the hovered block on `mousedown`,
 * which always fires before the `click` that opens this menu. The caller
 * grabs the real selection earlier, on `pointerdown` capture, before that
 * handler runs.
 */
// Structural leaf blocks a "turn into"/list conversion can't sensibly apply
// to — a multi-block selection that happens to cross one of these just skips
// it rather than letting `TextSelection.near` snap the cursor into a
// neighbouring block and silently convert the wrong thing.
const NON_FORMATTABLE = new Set(["hr", "image-block", "table"]);

function withSelectionBlocks(
  view: EditorView,
  target: Target,
  topLevel: boolean,
  sel: { from: number; to: number } | null,
): Target {
  if (!topLevel || !sel) return target;
  if (sel.from >= target.to || sel.to <= target.from) return target;

  // Hovering any line inside a flat list or a blockquote resolves `target`
  // to that whole container (see resolveTarget), so the top-level scan
  // below would only ever see one sibling here. Look at the container's own
  // children instead.
  if (LIST_NAMES.includes(target.node.type.name) || target.node.type.name === "blockquote") {
    const indices: number[] = [];
    target.node.forEach((child, offset, index) => {
      const from = target.from + 1 + offset;
      const to = from + child.nodeSize;
      if (to > sel.from && from < sel.to) indices.push(index);
    });
    if (indices.length > 1) target.containerItems = { anchor: target.from, indices };
    return target;
  }

  const blocks: { from: number; to: number; node: ProseNode; index: number }[] = [];
  view.state.doc.forEach((child, offset, index) => {
    if (NON_FORMATTABLE.has(child.type.name)) return;
    const from = offset;
    const to = offset + child.nodeSize;
    if (to > sel.from && from < sel.to) blocks.push({ from, to, node: child, index });
  });
  if (blocks.length > 1) target.blocks = blocks;
  return target;
}

function resolveTarget(
  view: EditorView,
  handleRect: DOMRect,
  pendingSelection: { from: number; to: number } | null,
): Target | null {
  const probe = view.posAtCoords({
    left: handleRect.right + 24,
    top: handleRect.top + handleRect.height / 2,
  });
  if (!probe) return null;
  try {
    const $pos = view.state.doc.resolve(probe.pos);
    if ($pos.depth >= 1) {
      // Prefer the closest enclosing list: a handle on a nested list item
      // should act on that sub-list (and its "active" type), not the whole
      // top-level list it's indented under.
      let depth = 1;
      for (let d = $pos.depth; d > 0; d--) {
        if (LIST_NAMES.includes($pos.node(d).type.name)) {
          depth = d;
          break;
        }
      }
      const from = $pos.before(depth);
      const node = $pos.node(depth);
      const to = from + node.nodeSize;
      const target: Target = {
        textPos: Math.min(Math.max(probe.pos, from + 1), to - 1),
        from,
        to,
        node,
      };
      return withSelectionBlocks(view, target, depth === 1, pendingSelection);
    }
    // Atom top-level blocks (images) have no text to probe "inside" of, so
    // posAtCoords only ever lands on the boundary next to them (depth 0).
    // Take whichever neighbouring top-level node the probe point sits by.
    const node = $pos.nodeAfter ?? $pos.nodeBefore;
    if (!node) return null;
    const from = $pos.nodeAfter ? $pos.pos : $pos.pos - node.nodeSize;
    const to = from + node.nodeSize;
    return withSelectionBlocks(view, { textPos: from, from, to, node }, true, pendingSelection);
  } catch {
    return null;
  }
}

/**
 * Build a `Target` from the live selection instead of a hovered handle, so the
 * keyboard-shortcut layer can reuse the exact same runners as the menu. Unlike
 * `resolveTarget`, the selection here is the real one — nothing has collapsed
 * it into a NodeSelection yet — so it is read straight from `view.state`.
 */
function targetFromSelection(view: EditorView): Target | null {
  try {
    const sel = view.state.selection;
    const doc = view.state.doc;
    // An AllSelection (Ctrl+A) resolves `$from` to the doc boundary (depth 0);
    // step one position in so it lands inside the first block.
    let $from = sel.$from;
    if ($from.depth < 1) {
      $from = doc.resolve(Math.min(sel.from + 1, Math.max(1, doc.content.size - 1)));
    }
    if ($from.depth < 1) return null;

    let depth = 1;
    for (let d = $from.depth; d > 0; d--) {
      if (LIST_NAMES.includes($from.node(d).type.name)) {
        depth = d;
        break;
      }
    }
    const from = $from.before(depth);
    const node = $from.node(depth);
    const to = from + node.nodeSize;
    const target: Target = {
      textPos: Math.min(Math.max(sel.head, from + 1), to - 1),
      from,
      to,
      node,
    };
    const range = sel.empty
      ? null
      : { from: Math.min(sel.from, sel.to), to: Math.max(sel.from, sel.to) };
    return withSelectionBlocks(view, target, depth === 1, range);
  } catch {
    return null;
  }
}

const ITEM_BY_ID = new Map<BlockActionId, Item>(
  GROUPS.flat()
    .filter((it): it is Item & { id: BlockActionId } => it.id !== undefined)
    .map((it) => [it.id, it]),
);

/**
 * Apply a block-menu conversion to the current selection by shortcut. Uses the
 * same runner (and therefore the same multi-block / lift-out-of-wrapper / merge
 * behaviour) as clicking the matching menu entry.
 */
export function runBlockAction(crepe: Crepe, id: BlockActionId): void {
  const item = ITEM_BY_ID.get(id);
  if (!item) return;
  crepe.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const target = targetFromSelection(view);
    if (!target) return;
    try {
      item.run(ctx, target);
    } catch (err) {
      console.error("[mdmeow] block shortcut failed", err);
    }
    view.focus();
  });
}

class BlockMenu {
  #el: HTMLElement;
  #crepe: Crepe;
  #target: Target | null = null;
  #open = false;
  #groupEls: HTMLElement[] = [];
  /**
   * The selection as it was right before the user pressed down on a block
   * handle, captured on `pointerdown` capture — see `withSelectionBlocks`
   * for why it can't just be read from `view.state.selection` later.
   */
  #pendingSelection: { from: number; to: number } | null = null;

  constructor(crepe: Crepe) {
    this.#crepe = crepe;
    this.#el = document.createElement("div");
    this.#el.className = "mdmeow-block-menu";
    this.#el.hidden = true;
    document.body.appendChild(this.#el);
    this.#build();

    document.addEventListener("pointerdown", this.#onPointerDown, true);
    window.addEventListener("keydown", this.#onKey, true);
    window.addEventListener("resize", this.hide);
    this.#el.addEventListener("click", this.#onItemClick);
  }

  toggle(handleEl: HTMLElement): void {
    if (this.#open) {
      this.hide();
      return;
    }
    const rect = handleEl.getBoundingClientRect();
    const pendingSelection = this.#pendingSelection;
    this.#pendingSelection = null;
    this.#crepe.editor.action((ctx) => {
      this.#target = resolveTarget(ctx.get(editorViewCtx), rect, pendingSelection);
    });
    if (!this.#target) return;

    this.#syncMenu();
    this.#el.hidden = false;
    this.#open = true;

    const w = this.#el.offsetWidth || 210;
    const h = this.#el.offsetHeight || 320;
    let left = rect.right + 6;
    if (left + w > window.innerWidth) left = rect.left - w - 6;
    let top = rect.top;
    if (top + h > window.innerHeight) top = window.innerHeight - h - 8;
    this.#el.style.left = `${Math.max(8, left)}px`;
    this.#el.style.top = `${Math.max(8, top)}px`;
  }

  hide = (): void => {
    if (!this.#open) return;
    this.#open = false;
    this.#el.hidden = true;
    this.#target = null;
  };

  destroy(): void {
    document.removeEventListener("pointerdown", this.#onPointerDown, true);
    window.removeEventListener("keydown", this.#onKey, true);
    window.removeEventListener("resize", this.hide);
    this.#el.remove();
  }

  #build(): void {
    this.#groupEls = GROUPS.map((group, gi) => {
      const wrap = document.createElement("div");
      wrap.className = "group";
      group.forEach((item, ii) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.dataset.g = String(gi);
        btn.dataset.i = String(ii);

        const label = document.createElement("span");
        label.className = "label";
        label.textContent = t(item.labelKey);
        btn.appendChild(label);

        if (item.id) {
          const sc = document.createElement("span");
          sc.className = "shortcut";
          sc.textContent = shortcutHint(item.id);
          btn.appendChild(sc);
        }
        wrap.appendChild(btn);
      });
      this.#el.appendChild(wrap);
      return wrap;
    });
  }

  /** Refresh the button labels after a language change. */
  retranslate(): void {
    this.#groupEls.forEach((wrap, gi) => {
      GROUPS[gi].forEach((item, ii) => {
        const label = wrap.children[ii]?.querySelector(".label");
        if (label) label.textContent = t(item.labelKey);
      });
    });
  }

  /**
   * Mark the button whose type matches the hovered block, and — when a
   * multi-block selection is active — hide the items that only make sense
   * for a single block (a whole group hides too once every item in it is
   * hidden, so its top-border separator doesn't dangle over empty space).
   */
  #syncMenu(): void {
    const node = this.#target?.node;
    const multi =
      (this.#target?.blocks?.length ?? 0) > 1 ||
      (this.#target?.containerItems?.indices.length ?? 0) > 1;
    this.#groupEls.forEach((wrap, gi) => {
      let anyVisible = false;
      GROUPS[gi].forEach((item, ii) => {
        const btn = wrap.children[ii] as HTMLButtonElement | undefined;
        if (!btn) return;
        const on = !!(node && item.active?.(node));
        btn.classList.toggle("is-active", on);
        btn.toggleAttribute("aria-current", on);
        const visible = !multi || item.multiBlock !== false;
        btn.hidden = !visible;
        if (visible) anyVisible = true;
      });
      wrap.hidden = !anyVisible;
    });
  }

  #onItemClick = (e: Event): void => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("button[data-g]");
    if (!btn || !this.#target) return;
    const item = GROUPS[Number(btn.dataset.g)]?.[Number(btn.dataset.i)];
    const target = this.#target;
    this.hide();
    if (!item) return;
    this.#crepe.editor.action((ctx) => {
      try {
        item.run(ctx, target);
      } catch (err) {
        console.error("[mdmeow] block action failed", err);
      }
      ctx.get(editorViewCtx).focus();
    });
  };

  #onPointerDown = (e: Event): void => {
    const t = e.target as HTMLElement;
    if (this.#el.contains(t)) return;
    if (t.closest(".milkdown-block-handle")) {
      // Milkdown's own `mousedown` handler on this same element (added by
      // @milkdown/plugin-block's BlockService) is about to collapse the
      // current selection into a NodeSelection on the hovered block —
      // pointerdown always fires and fully resolves before mousedown does,
      // so this is the last point the real (possibly multi-block) selection
      // can still be read.
      this.#crepe.editor.action((ctx) => {
        const { from, to } = ctx.get(editorViewCtx).state.selection;
        this.#pendingSelection =
          from === to ? null : { from: Math.min(from, to), to: Math.max(from, to) };
      });
      return; // let the click toggle
    }
    this.#pendingSelection = null;
    this.hide();
  };

  #onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && this.#open) {
      e.preventDefault();
      e.stopImmediatePropagation(); // don't let this Esc trigger quit-on-escape
      this.hide();
    }
  };
}

export interface BlockMenuHandle {
  dispose: () => void;
  /** Re-label the menu buttons after a language change. */
  retranslate: () => void;
}

export function installBlockMenu(crepe: Crepe): BlockMenuHandle {
  const menu = new BlockMenu(crepe);
  const onClick = (e: MouseEvent) => {
    const handle = (e.target as HTMLElement).closest<HTMLElement>(
      ".milkdown-block-handle",
    );
    if (!handle) return;
    e.preventDefault();
    e.stopPropagation();
    menu.toggle(handle);
  };
  document.addEventListener("click", onClick, true);
  return {
    dispose: () => {
      document.removeEventListener("click", onClick, true);
      menu.destroy();
    },
    retranslate: () => menu.retranslate(),
  };
}
