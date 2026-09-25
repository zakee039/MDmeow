// Miku Cream is MDmeow's single built-in rendering theme. We still inject
// Crepe's light frame stylesheet because it contains the editor component
// structure; src/styles.css then owns the visual rendering.
import frameLight from "@milkdown/crepe/theme/frame.css?inline";
import {
  ensureSyntaxTree,
  syntaxTree,
  syntaxTreeAvailable,
} from "@codemirror/language";
import type { Range } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { classHighlighter, highlightTree } from "@lezer/highlight";

export const mikuCodePalette = {
  base: "#383a42",
  keyword: "#087d75",
  functionName: "#2d6da3",
  number: "#a6383f",
  type: "#7a4fa3",
  string: "#c52f73",
  definition: "#2f7d53",
  operator: "#a65d16",
  comment: "#737d79",
  link: "#147a74",
  invalid: "#9f2530",
} as const;

const codeEditorTheme = EditorView.theme(
  {
    "&": {
      color: mikuCodePalette.base,
      backgroundColor: "var(--bg)",
    },
    ".cm-scroller": {
      fontFamily: 'Consolas, "Courier New", Courier, monospace',
      fontSize: "14px",
      lineHeight: "18px",
    },
    ".cm-content": {
      caretColor: "#147a74",
      padding: "10px 0",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "#147a74",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "#c8ece8",
    },
    ".cm-line": {
      minHeight: "18px",
      padding: "0 14px 0 12px",
    },
    ".cm-gutters": {
      color: "#8a9491",
      backgroundColor: "#eef5f4",
      borderRight: "1px solid #c8ddda",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "#e1f2ef",
      color: "#596461",
      border: "none",
    },
    ".tok-keyword": {
      color: mikuCodePalette.keyword,
      fontWeight: "600",
    },
    ".tok-variableName, .tok-propertyName, .tok-macroName": {
      color: mikuCodePalette.base,
    },
    ".tok-labelName": {
      color: mikuCodePalette.functionName,
    },
    ".tok-number, .tok-bool, .tok-atom, .tok-literal": {
      color: mikuCodePalette.number,
    },
    ".tok-typeName, .tok-className, .tok-namespace": {
      color: mikuCodePalette.type,
    },
    ".tok-string, .tok-string2, .tok-inserted": {
      color: mikuCodePalette.string,
    },
    ".tok-definition": {
      color: mikuCodePalette.definition,
    },
    ".tok-operator, .tok-punctuation": {
      color: mikuCodePalette.operator,
    },
    ".tok-meta, .tok-comment": {
      color: mikuCodePalette.comment,
      fontStyle: "italic",
    },
    ".tok-link, .tok-url": {
      color: mikuCodePalette.link,
      textDecoration: "underline",
    },
    ".tok-strong": {
      fontWeight: "700",
    },
    ".tok-emphasis": {
      fontStyle: "italic",
    },
    ".tok-invalid, .tok-deleted": {
      color: mikuCodePalette.invalid,
    },
  },
  { dark: false },
);

function semanticTokenDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const tree = syntaxTree(view.state);
  if (!tree.length) return Decoration.none;

  for (const { from, to } of view.visibleRanges) {
    highlightTree(
      tree,
      classHighlighter,
      (tokenFrom, tokenTo, classes) => {
        if (tokenTo > tokenFrom) {
          ranges.push(
            Decoration.mark({ class: classes }).range(tokenFrom, tokenTo),
          );
        }
      },
      from,
      to,
    );
  }
  return Decoration.set(ranges, true);
}

const semanticTokenPlugin = ViewPlugin.fromClass(
  class {
    readonly view: EditorView;
    tree;
    decorations: DecorationSet;
    parseFrame: number | null = null;

    constructor(view: EditorView) {
      this.view = view;
      this.tree = syntaxTree(view.state);
      this.decorations = semanticTokenDecorations(view);
      this.ensureVisibleSyntax();
    }

    update(update: ViewUpdate): void {
      const nextTree = syntaxTree(update.state);
      if (nextTree !== this.tree || update.viewportChanged || update.docChanged) {
        this.tree = nextTree;
        this.decorations = semanticTokenDecorations(update.view);
      }
      this.ensureVisibleSyntax();
    }

    ensureVisibleSyntax(): void {
      const tree = syntaxTree(this.view.state);
      if (!tree.length) return; // Plain text / no language parser enabled.

      const upto = this.view.visibleRanges.reduce(
        (max, range) => Math.max(max, range.to),
        0,
      );
      if (!upto || syntaxTreeAvailable(this.view.state, upto)) return;
      if (this.parseFrame !== null) return;

      // CodeMirror intentionally stops background parsing after a time/viewport
      // budget. For large files that can leave a later viewport without a
      // syntax tree, which made MDmeow appear to "stop highlighting" after a
      // certain length. Advance the parser in small frame-sized chunks until
      // the currently visible range is covered, without blocking a long scroll.
      this.parseFrame = requestAnimationFrame(() => {
        this.parseFrame = null;
        const target = this.view.visibleRanges.reduce(
          (max, range) => Math.max(max, range.to),
          0,
        );
        if (!target || syntaxTreeAvailable(this.view.state, target)) return;
        const parsed = ensureSyntaxTree(this.view.state, target, 40);
        if (parsed && parsed !== syntaxTree(this.view.state)) {
          // Equivalent to CodeMirror's forceParsing(), but kept local here to
          // avoid coupling to a second @codemirror/view package version pulled
          // in by language-data.
          this.view.dispatch({});
        }
        if (!syntaxTreeAvailable(this.view.state, target)) {
          this.ensureVisibleSyntax();
        }
      });
    }

    destroy(): void {
      if (this.parseFrame !== null) cancelAnimationFrame(this.parseFrame);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

export const mikuCreamCodeMirrorTheme = [
  codeEditorTheme,
  semanticTokenPlugin,
];

function themeStyleEl(): HTMLStyleElement {
  let el = document.getElementById("crepe-theme") as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = "crepe-theme";
    document.head.appendChild(el);
  }
  return el;
}

export function installMikuCreamRendering(): void {
  themeStyleEl().textContent = frameLight;
}
