// Handle multi-item list selections beginning with the first item, and
// selections that continue beyond the list into the following paragraph.
import { listItemSchema } from "@milkdown/kit/preset/commonmark";
import { $prose } from "@milkdown/kit/utils";
import { keymap } from "@milkdown/kit/prose/keymap";
import { liftListItem, sinkListItem } from "@milkdown/kit/prose/schema-list";
import { TextSelection, type Command } from "@milkdown/kit/prose/state";

export const listIndentKeymap = $prose((ctx) => {
  const itemType = listItemSchema.type(ctx);
  const sink = sinkListItem(itemType);

  const indentFromFirst: Command = (state, dispatch) => {
    const { $from, $to } = state.selection;
    const range = $from.blockRange(
      $to,
      (node) => node.childCount > 0 && node.firstChild!.type === itemType,
    );
    if (!range || range.startIndex !== 0) return false;
    if (range.endIndex - range.startIndex < 2) return true;

    // Sink the selected items after the first, which has no preceding sibling.
    const secondItem = range.start + range.parent.child(0).nodeSize;
    const $start = TextSelection.near(state.doc.resolve(secondItem + 1)).$from;
    const shifted = state.apply(
      state.tr.setSelection(TextSelection.between($start, $to)),
    );
    return sink(
      shifted,
      dispatch &&
        ((inner) => {
          const tr = state.tr;
          inner.steps.forEach((step) => tr.step(step));
          dispatch(tr.scrollIntoView());
        }),
    );
  };

  // When the selection continues into the paragraph after a list, target
  // only the list items, retaining the text outside the list unchanged.
  const clipToList = (cmd: Command): Command => (state, dispatch) => {
    const { $from, $to } = state.selection;
    if ($from.sameParent($to)) return false;
    for (let depth = $from.depth; depth > 0; depth--) {
      const list = $from.node(depth);
      if (list.childCount === 0 || list.firstChild!.type !== itemType) continue;
      if ($to.pos <= $from.end(depth)) return false;
      const clipped = TextSelection.between($from, state.doc.resolve($from.end(depth)));
      const shifted = state.apply(state.tr.setSelection(clipped));
      return cmd(
        shifted,
        dispatch &&
          ((inner) => {
            const tr = state.tr;
            inner.steps.forEach((step) => tr.step(step));
            dispatch(tr.scrollIntoView());
          }),
      );
    }
    return false;
  };

  return keymap({
    Tab: (state, dispatch, view) =>
      indentFromFirst(state, dispatch, view) || clipToList(sink)(state, dispatch, view),
    "Shift-Tab": clipToList(liftListItem(itemType)),
  });
});
