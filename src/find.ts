// Plain-text find / replace for the WYSIWYG editor.
//
// A ProseMirror plugin keeps the list of matches for the current query and
// decorates them; `Editor` (editor.ts) drives it and the find bar (find-bar.ts)
// renders the UI. Matches are found within single text nodes, so a query that
// straddles a formatting boundary (e.g. part bold) will not be found — an
// acceptable limit for a Markdown editor.

import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";

export interface FindStatus {
  /** Total matches for the current query. */
  count: number;
  /** 1-based position of the active match, or 0 when there is none. */
  index: number;
}

export const findKey = new PluginKey<FindState>("mdmeow-find");

export interface Match {
  from: number;
  to: number;
}

export interface FindState {
  query: string;
  caseSensitive: boolean;
  matches: Match[];
  active: number;
  deco: DecorationSet;
}

interface FindMeta {
  query?: string;
  caseSensitive?: boolean;
  active?: number;
  step?: number;
}

const EMPTY: FindState = {
  query: "",
  caseSensitive: false,
  matches: [],
  active: -1,
  deco: DecorationSet.empty,
};

function scan(doc: ProseNode, query: string, caseSensitive: boolean): Match[] {
  const out: Match[] = [];
  if (!query) return out;
  const needle = caseSensitive ? query : query.toLowerCase();
  const step = Math.max(1, needle.length);
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const hay = caseSensitive ? node.text : node.text.toLowerCase();
    let i = hay.indexOf(needle);
    while (i !== -1) {
      out.push({ from: pos + i, to: pos + i + query.length });
      i = hay.indexOf(needle, i + step);
    }
  });
  return out;
}

function decorate(
  doc: ProseNode,
  matches: Match[],
  active: number,
): DecorationSet {
  if (!matches.length) return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    matches.map((m, i) =>
      Decoration.inline(m.from, m.to, {
        class:
          i === active
            ? "mdmeow-find-hit mdmeow-find-hit--active"
            : "mdmeow-find-hit",
      }),
    ),
  );
}

function wrap(index: number, len: number): number {
  if (len === 0) return -1;
  return ((index % len) + len) % len;
}

function recompute(
  doc: ProseNode,
  query: string,
  caseSensitive: boolean,
  desiredActive: number,
): FindState {
  const matches = scan(doc, query, caseSensitive);
  const active = wrap(desiredActive, matches.length);
  return {
    query,
    caseSensitive,
    matches,
    active,
    deco: decorate(doc, matches, active),
  };
}

export const findPlugin = $prose(
  () =>
    new Plugin<FindState>({
      key: findKey,
      state: {
        init: () => EMPTY,
        apply(tr: Transaction, prev: FindState): FindState {
          const meta = tr.getMeta(findKey) as FindMeta | undefined;
          if (meta) {
            const query = meta.query ?? prev.query;
            const caseSensitive = meta.caseSensitive ?? prev.caseSensitive;
            let desired: number;
            if (typeof meta.active === "number") desired = meta.active;
            else if (typeof meta.step === "number")
              desired = (prev.active < 0 ? 0 : prev.active) + meta.step;
            else desired = prev.active < 0 ? 0 : prev.active;
            return recompute(tr.doc, query, caseSensitive, desired);
          }
          if (!prev.query) return prev;
          if (tr.docChanged) {
            return recompute(tr.doc, prev.query, prev.caseSensitive, prev.active);
          }
          return prev;
        },
      },
      props: {
        decorations(state: EditorState) {
          return findKey.getState(state)?.deco ?? null;
        },
      },
    }),
);

export function statusOf(state: FindState | null | undefined): FindStatus {
  if (!state || state.matches.length === 0) return { count: 0, index: 0 };
  return { count: state.matches.length, index: state.active + 1 };
}

export function activeMatch(
  state: FindState | null | undefined,
): Match | null {
  if (!state || state.active < 0) return null;
  return state.matches[state.active] ?? null;
}

export function allMatches(state: FindState | null | undefined): Match[] {
  return state?.matches ?? [];
}
