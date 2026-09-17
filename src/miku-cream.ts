// Miku Cream is Mowl's single built-in rendering theme. We still inject
// Crepe's light frame stylesheet because it contains the editor component
// structure; src/styles.css then owns the visual rendering.
import frameLight from "@milkdown/crepe/theme/frame.css?inline";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

const codeEditorTheme = EditorView.theme(
  {
    "&": {
      color: "#383a42",
      backgroundColor: "#fbfdfc",
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
    ".cm-line:nth-child(odd)": {
      backgroundColor: "transparent",
    },
    ".cm-line:nth-child(even)": {
      backgroundColor: "transparent",
    },
    ".cm-activeLine, .cm-activeLineGutter": {
      backgroundColor: "transparent",
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
  },
  { dark: false },
);

const codeHighlightStyle = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.modifier, tags.operatorKeyword],
    color: "#087d75",
    fontWeight: "600",
  },
  {
    tag: [tags.name, tags.propertyName, tags.macroName],
    color: "#383a42",
  },
  {
    tag: [tags.function(tags.variableName), tags.labelName],
    color: "#2d6da3",
  },
  {
    tag: [tags.number, tags.bool, tags.null, tags.atom],
    color: "#a6383f",
  },
  {
    tag: [tags.typeName, tags.className, tags.namespace],
    color: "#7a4fa3",
  },
  {
    tag: [tags.string, tags.regexp, tags.escape, tags.inserted],
    color: "#c52f73",
  },
  {
    tag: [tags.definition(tags.name), tags.annotation],
    color: "#2f7d53",
  },
  {
    tag: [tags.operator, tags.punctuation],
    color: "#a65d16",
  },
  {
    tag: [tags.meta, tags.comment],
    color: "#737d79",
    fontStyle: "italic",
  },
  { tag: tags.link, color: "#147a74", textDecoration: "underline" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.invalid, color: "#9f2530" },
]);

export const mikuCreamCodeMirrorTheme = [
  codeEditorTheme,
  syntaxHighlighting(codeHighlightStyle),
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
