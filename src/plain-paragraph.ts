import { EditorView as CodeMirrorView } from "@codemirror/view";
import type { Ctx } from "@milkdown/kit/ctx";
import { paragraphSchema } from "@milkdown/kit/preset/commonmark";
import { closeHistory } from "@milkdown/kit/prose/history";
import { Fragment, type Node as ProseNode } from "@milkdown/kit/prose/model";
import { NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

const PLAIN_PARAGRAPH_ATTR = "mdmeowPlainParagraph";

/** Keep this command's empty paragraphs as Markdown whitespace, without
 * changing Crepe's treatment of ordinary Enter-created empty paragraphs. */
export function configurePlainParagraph(ctx: Ctx): void {
  ctx.update(paragraphSchema.key, (previous) => (ctx) => {
    const spec = previous(ctx);
    const serialize = spec.toMarkdown.runner;
    return {
      ...spec,
      attrs: {
        ...spec.attrs,
        [PLAIN_PARAGRAPH_ATTR]: { default: false, validate: "boolean" },
      },
      toMarkdown: {
        ...spec.toMarkdown,
        runner: (state, node) => {
          if (node.attrs[PLAIN_PARAGRAPH_ATTR] && !node.content.size) {
            state.openNode("paragraph").closeNode();
          } else serialize(state, node);
        },
      },
    };
  });
}

/** CodeMirror node views can own focus while the outer selection is stale. */
function focusedCodeSelection(view: EditorView): TextSelection | null {
  const active = view.dom.ownerDocument.activeElement;
  if (!(active instanceof HTMLElement) || !view.dom.contains(active)) return null;
  const block = active.closest(".milkdown-code-block");
  if (!block) return null;
  const cm = CodeMirrorView.findFromDOM(active);
  if (!cm?.hasFocus) return null;

  // Opaque node views may resolve to either their boundary or content start.
  // Resolve that boundary without relying on the outer editor's selection.
  const $pos = view.state.doc.resolve(view.posAtDOM(block, 0));
  let pos = $pos.pos;
  if ($pos.parent.type.name === "code_block") pos = $pos.before();
  if (view.state.doc.nodeAt(pos)?.type.name !== "code_block") return null;
  const { anchor, head } = cm.state.selection.main;
  return TextSelection.create(view.state.doc, pos + 1 + anchor, pos + 1 + head);
}

function withoutMarks(fragment: Fragment): Fragment {
  const children: ProseNode[] = [];
  fragment.forEach((node) => {
    children.push(
      node.isLeaf ? node.mark([]) : node.copy(withoutMarks(node.content)).mark([]),
    );
  });
  return Fragment.fromArray(children);
}

function side(
  node: ProseNode,
  children: ProseNode[],
  attrs = node.attrs,
): ProseNode | null {
  if (!children.length) return null;
  return node.type.validContent(Fragment.fromArray(children))
    ? node.type.create(attrs, children, node.marks)
    : null;
}

function remainingSide(
  node: ProseNode,
  children: ProseNode[],
  order: number,
): ProseNode[] | null {
  if (!children.length) return [];
  // A parent list item whose introductory paragraph is left before the split
  // cannot be continued across a top-level paragraph. Keep its remaining
  // nested blocks as independent blocks instead of inventing an empty item.
  if (node.type.name === "list_item" && children[0].type.name !== "paragraph") {
    return children;
  }
  if (["bullet_list", "ordered_list"].includes(node.type.name)) {
    const result: ProseNode[] = [];
    let items: ProseNode[] = [];
    let nextOrder = order;
    const flush = (): void => {
      if (!items.length) return;
      const attrs =
        node.type.name === "ordered_list"
          ? { ...node.attrs, order: nextOrder }
          : node.attrs;
      result.push(node.type.create(attrs, items, node.marks));
      nextOrder += items.length;
      items = [];
    };
    for (const child of children) {
      if (child.type.name === "list_item") items.push(child);
      else {
        flush();
        result.push(child);
      }
    }
    flush();
    return result;
  }
  const result = side(node, children);
  return result ? [result] : null;
}

/**
 * Split the current text block into a formatted prefix and an unmarked,
 * top-level paragraph. Containers on either side retain their remaining
 * children; the paragraph is placed at the cursor, not after the whole list.
 */
export function insertPlainParagraph(view: EditorView): boolean {
  const { state } = view;
  if (!view.editable || !state.schema.nodes.paragraph) return false;
  let selection = focusedCodeSelection(view) ?? state.selection;
  const tr = closeHistory(state.tr.setSelection(selection));
  if (!selection.empty && !(selection instanceof NodeSelection)) {
    tr.deleteSelection();
    selection = tr.selection;
  }
  const doc = tr.doc;
  const $head = selection.$head;
  const paragraph = state.schema.nodes.paragraph;

  // Tables are indivisible Markdown blocks. A selected image, formula preview,
  // rule, or table starts a new paragraph after its enclosing top-level block.
  const inTable = Array.from({ length: $head.depth }, (_, i) =>
    $head.node(i + 1),
  ).some((node) => node.type.name === "table");
  if (selection instanceof NodeSelection || !$head.parent.isTextblock || inTable) {
    const depth = $head.depth ? 1 : 0;
    const node = depth ? $head.node(depth) : doc.nodeAt(selection.from);
    if (!node) return false;
    const pos = depth ? $head.after(depth) : selection.from + node.nodeSize;
    const next = doc.nodeAt(pos);
    // Crepe already appends an empty paragraph after non-text blocks. Use it
    // rather than creating a second empty line (serialized as <br />).
    const end =
      next?.type === paragraph && !next.content.size ? pos + next.nodeSize : pos;
    tr.replaceWith(pos, end, paragraph.create({ [PLAIN_PARAGRAPH_ATTR]: true }));
    tr.setSelection(TextSelection.create(tr.doc, pos + 1));
    tr.setStoredMarks([]);
    view.dispatch(tr.scrollIntoView());
    view.focus();
    return true;
  }

  const depth = $head.depth;
  const block = $head.parent;
  const offset = $head.parentOffset;
  let before: ProseNode | null = block.copy(block.content.cut(0, offset));
  if (before.type === paragraph && !before.content.size) {
    before = paragraph.create({ ...before.attrs, [PLAIN_PARAGRAPH_ATTR]: true });
  }
  let after: ProseNode[] = [];
  const plain = paragraph.create(
    { [PLAIN_PARAGRAPH_ATTR]: true },
    withoutMarks(block.content.cut(offset)),
  );

  for (let d = depth - 1; d > 0; d--) {
    const container = $head.node(d);
    const index = $head.index(d);
    const beforeChildren: ProseNode[] = [];
    const afterChildren: ProseNode[] = [];
    for (let i = 0; i < index; i++) beforeChildren.push(container.child(i));
    if (before) beforeChildren.push(before);
    afterChildren.push(...after);
    for (let i = index + 1; i < container.childCount; i++) {
      afterChildren.push(container.child(i));
    }
    const nextOrder =
      Number(container.attrs.order ?? 1) + index +
      (after.some((node) => node.type.name === "list_item") ? 0 : 1);
    before = side(container, beforeChildren);
    const remaining = remainingSide(container, afterChildren, nextOrder);
    // Never discard a container's remaining content if its schema cannot be
    // split. List and quote containers retain only their original content.
    if ((beforeChildren.length && !before) || !remaining) {
      return false;
    }
    after = remaining;
  }

  const from = $head.before(1);
  let to = $head.after(1);
  const next = doc.nodeAt(to);
  if (
    !plain.content.size && !after.length &&
    next?.type === paragraph && !next.content.size
  ) {
    to += next.nodeSize;
  }
  const replacement = [before, plain, ...after].filter(
    (node): node is ProseNode => !!node,
  );
  tr.replaceWith(from, to, replacement);
  tr.setSelection(TextSelection.create(tr.doc, from + (before?.nodeSize ?? 0) + 1));
  tr.setStoredMarks([]);
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}
