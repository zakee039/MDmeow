import { history, historyKeymap, defaultKeymap, indentWithTab } from "@codemirror/commands";
import {
  bracketMatching,
  LanguageDescription,
  type LanguageSupport,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import {
  Compartment,
  EditorSelection,
  EditorState,
  StateEffect,
  StateField,
  type Extension,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  type ViewUpdate,
} from "@codemirror/view";

import { mikuCreamCodeMirrorTheme } from "./miku-cream";
import type { FindStatus } from "./find-bar";

const setAlternateRows = StateEffect.define<boolean>();

const alternateRowsEnabled = StateField.define<boolean>({
  create: () => true,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setAlternateRows)) return effect.value;
    }
    return value;
  },
});

function alternateLineDecorations(view: EditorView): DecorationSet {
  if (!view.state.field(alternateRowsEnabled)) return Decoration.none;
  const ranges = [];
  for (const { from, to } of view.visibleRanges) {
    let line = view.state.doc.lineAt(from);
    while (line.from <= to) {
      if (line.number % 2 === 0) {
        ranges.push(Decoration.line({ class: "mdmeow-code-line-alt" }).range(line.from));
      }
      if (line.to >= view.state.doc.length) break;
      line = view.state.doc.line(line.number + 1);
    }
  }
  return Decoration.set(ranges, true);
}

const alternateRowsPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = alternateLineDecorations(view);
    }

    update(update: ViewUpdate): void {
      const toggled =
        update.startState.field(alternateRowsEnabled) !==
        update.state.field(alternateRowsEnabled);
      if (update.docChanged || update.viewportChanged || toggled) {
        this.decorations = alternateLineDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

const codeDocumentTheme = EditorView.theme({
  "&": {
    height: "100%",
    minHeight: "0",
    backgroundColor: "var(--bg)",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily:
      'var(--source-font, Consolas, "Courier New", Courier, monospace)',
    fontSize: "var(--source-font-size, 15px)",
    lineHeight: "1.6",
  },
  ".cm-content": {
    minWidth: "max-content",
    padding: "10px 0 48px",
    caretColor: "#147a74",
  },
  ".cm-line": {
    minHeight: "1.6em",
    padding: "0 28px",
    backgroundColor: "var(--bg)",
  },
  ".cm-line.mdmeow-code-line-alt": {
    backgroundColor: "var(--code-alt-row-color, #faffff)",
  },
  ".cm-gutters": {
    backgroundColor: "#f1f4f3",
    color: "#98a19e",
    borderRight: "1px solid #dce4e2",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    minWidth: "54px",
    padding: "0 12px 0 8px",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "#cfede9",
    color: "#5f7773",
    fontWeight: "600",
  },
  ".cm-line.cm-activeLine": {
    backgroundColor: "var(--bg)",
  },
  ".cm-line.cm-activeLine.mdmeow-code-line-alt": {
    backgroundColor: "var(--code-alt-row-color, #faffff)",
  },
  "&.cm-focused": {
    outline: "none",
  },
});

export class CodeEditor {
  readonly host: HTMLElement;
  onChange: () => void = () => {};

  #view: EditorView | null = null;
  #language = new Compartment();
  #languageLoadToken = 0;
  #alternateRows = true;
  #suppressChange = false;

  #query = "";
  #caseSensitive = false;
  #matches: number[] = [];
  #activeMatch = 0;

  constructor(host: HTMLElement) {
    this.host = host;
  }

  init(text = ""): void {
    if (this.#view) return;
    this.#view = new EditorView({
      state: this.#createState(text),
      parent: this.host,
    });
  }

  destroy(): void {
    this.#view?.destroy();
    this.#view = null;
  }

  #createState(text: string): EditorState {
    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      bracketMatching(),
      highlightActiveLine(),
      EditorState.tabSize.of(2),
      EditorView.contentAttributes.of({ spellcheck: "false", autocapitalize: "off" }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !this.#suppressChange) this.onChange();
      }),
      alternateRowsEnabled.init(() => this.#alternateRows),
      alternateRowsPlugin,
      ...mikuCreamCodeMirrorTheme,
      codeDocumentTheme,
      this.#language.of([]),
    ];
    return EditorState.create({ doc: text, extensions });
  }

  async setDocument(
    text: string,
    path: string | null,
    scrollTop = 0,
  ): Promise<void> {
    if (!this.#view) this.init();
    if (!this.#view) return;
    this.#clearFindState();
    this.#suppressChange = true;
    this.#view.setState(this.#createState(text));
    this.#suppressChange = false;
    await this.setLanguageForPath(path);
    requestAnimationFrame(() => {
      if (this.#view) this.#view.scrollDOM.scrollTop = scrollTop;
    });
  }

  getText(): string {
    return this.#view?.state.doc.toString() ?? "";
  }

  setText(text: string): void {
    if (!this.#view) return;
    const current = this.getText();
    if (current === text) return;
    this.#suppressChange = true;
    this.#view.dispatch({
      changes: { from: 0, to: current.length, insert: text },
      selection: EditorSelection.cursor(0),
    });
    this.#suppressChange = false;
    this.#clearFindState();
  }

  async setLanguageForPath(path: string | null): Promise<void> {
    const view = this.#view;
    if (!view) return;
    const token = ++this.#languageLoadToken;
    const filename = path?.replace(/\\/g, "/").split("/").pop() ?? "untitled.md";
    const description = LanguageDescription.matchFilename(languages, filename);
    let support: LanguageSupport | null = null;
    try {
      support = description ? await description.load() : null;
    } catch {
      support = null;
    }
    if (!this.#view || token !== this.#languageLoadToken) return;
    this.#view.dispatch({
      effects: this.#language.reconfigure(support ? [support] : []),
    });
    this.host.dataset.language = description?.name ?? "Plain Text";
  }

  setAlternateRows(enabled: boolean): void {
    this.#alternateRows = enabled;
    this.#view?.dispatch({ effects: setAlternateRows.of(enabled) });
  }

  focus(): void {
    this.#view?.focus();
  }

  get scrollTop(): number {
    return this.#view?.scrollDOM.scrollTop ?? 0;
  }

  set scrollTop(value: number) {
    if (this.#view) this.#view.scrollDOM.scrollTop = value;
  }

  get scrollHeight(): number {
    return this.#view?.scrollDOM.scrollHeight ?? 0;
  }

  get clientHeight(): number {
    return this.#view?.scrollDOM.clientHeight ?? 0;
  }

  selectionText(): string {
    const view = this.#view;
    if (!view) return "";
    const range = view.state.selection.main;
    return view.state.sliceDoc(range.from, range.to);
  }

  insertText(text: string): void {
    const view = this.#view;
    if (!view) return;
    const range = view.state.selection.main;
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: text },
      selection: EditorSelection.cursor(range.from + text.length),
    });
    view.focus();
  }

  #replaceRange(text: string, from: number, to: number): void {
    const view = this.#view;
    if (!view) return;
    view.dispatch({
      changes: { from, to, insert: text },
      selection: EditorSelection.cursor(from + text.length),
    });
  }

  #recomputeMatches(): void {
    this.#matches = [];
    if (!this.#query) return;
    const text = this.getText();
    const haystack = this.#caseSensitive ? text : text.toLowerCase();
    const needle = this.#caseSensitive ? this.#query : this.#query.toLowerCase();
    const stride = Math.max(1, needle.length);
    let index = haystack.indexOf(needle);
    while (index !== -1) {
      this.#matches.push(index);
      index = haystack.indexOf(needle, index + stride);
    }
    if (this.#activeMatch >= this.#matches.length) this.#activeMatch = 0;
  }

  #selectActiveMatch(): void {
    const view = this.#view;
    if (!view || !this.#matches.length) return;
    if (this.#activeMatch >= this.#matches.length) this.#activeMatch = 0;
    const from = this.#matches[this.#activeMatch];
    const to = from + this.#query.length;
    view.dispatch({
      selection: { anchor: from, head: to },
      effects: EditorView.scrollIntoView(from, { y: "center" }),
    });
    view.focus();
  }

  #findStatus(): FindStatus {
    return {
      count: this.#matches.length,
      index: this.#matches.length ? this.#activeMatch + 1 : 0,
    };
  }

  findSet(query: string, caseSensitive: boolean): FindStatus {
    this.#query = query;
    this.#caseSensitive = caseSensitive;
    this.#activeMatch = 0;
    this.#recomputeMatches();
    this.#selectActiveMatch();
    return this.#findStatus();
  }

  findStep(dir: 1 | -1): FindStatus {
    if (!this.#matches.length) return this.#findStatus();
    this.#activeMatch =
      (this.#activeMatch + dir + this.#matches.length) % this.#matches.length;
    this.#selectActiveMatch();
    return this.#findStatus();
  }

  findReplace(replacement: string): FindStatus {
    if (!this.#matches.length || !this.#query) return this.#findStatus();
    const from = this.#matches[this.#activeMatch] ?? this.#matches[0];
    const current = this.getText().slice(from, from + this.#query.length);
    const hit = this.#caseSensitive
      ? current === this.#query
      : current.toLowerCase() === this.#query.toLowerCase();
    if (hit) this.#replaceRange(replacement, from, from + this.#query.length);
    this.#recomputeMatches();
    this.#selectActiveMatch();
    return this.#findStatus();
  }

  findReplaceAll(replacement: string): FindStatus {
    if (!this.#query) return this.#findStatus();
    const escaped = this.#query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, this.#caseSensitive ? "g" : "gi");
    const current = this.getText();
    const next = current.replace(re, () => replacement);
    if (next !== current) this.#replaceRange(next, 0, current.length);
    this.#activeMatch = 0;
    this.#recomputeMatches();
    return this.#findStatus();
  }

  findClear(): void {
    this.#clearFindState();
  }

  #clearFindState(): void {
    this.#query = "";
    this.#matches = [];
    this.#activeMatch = 0;
  }
}

