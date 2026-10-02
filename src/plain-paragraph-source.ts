import { isolateHistory } from "@codemirror/commands";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import {
  EditorSelection,
  Text,
  Transaction,
  type EditorState,
  type TransactionSpec,
} from "@codemirror/state";

type MarkdownNode = ReturnType<ReturnType<typeof syntaxTree>["resolve"]>;

interface InlineSpan {
  from: number;
  to: number;
  contentFrom: number;
  contentTo: number;
}

interface SplitBlock {
  from: number;
  to: number;
  position: number;
  prefix: string;
  tail: PlainTail;
  container: string;
}

interface PlainTail {
  text: string;
  atoms: Array<{ token: string; text: string }>;
}

const textTail = (text: string): PlainTail => ({ text, atoms: [] });

const leafBlocks = /^(?:Paragraph|ATXHeading[1-6]|SetextHeading[12]|FencedCode|CodeBlock|HTMLBlock)$/;

function children(node: MarkdownNode): MarkdownNode[] {
  const result: MarkdownNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) result.push(child);
  return result;
}

function inlineSpan(node: MarkdownNode): InlineSpan | null {
  const parts = children(node);
  if (/^(?:Emphasis|StrongEmphasis|Strikethrough|InlineCode|Autolink)$/.test(node.name)) {
    const first = parts[0];
    const last = parts[parts.length - 1];
    if (first && last && first !== last) {
      return { from: node.from, to: node.to, contentFrom: first.to, contentTo: last.from };
    }
  }
  if (node.name === "Link" || node.name === "Image") {
    const opening = parts.find((part) => part.name === "LinkMark");
    const closing = parts.find((part) => part.name === "LinkMark" && part.from > (opening?.from ?? node.to));
    if (opening && closing) {
      return { from: node.from, to: node.to, contentFrom: opening.to, contentTo: closing.from };
    }
  }
  return null;
}

function inlineMathSpans(state: EditorState, block: MarkdownNode): InlineSpan[] {
  const result: InlineSpan[] = [];
  const text = state.doc.sliceString(block.from, block.to);
  const tree = syntaxTree(state);
  let opening: { from: number; size: number } | null = null;
  for (const match of text.matchAll(/(?<!\\)\${1,2}(?!\$)/g)) {
    const from = block.from + match.index;
    let literal = false;
    for (let node: MarkdownNode | null = tree.resolve(from, 1); node && node !== block; node = node.parent) {
      if (node.name === "InlineCode" || node.name === "URL" || node.name === "LinkTitle") literal = true;
    }
    if (literal) continue;
    if (opening && opening.size === match[0].length) {
      result.push({ from: opening.from, to: from + match[0].length, contentFrom: opening.from + opening.size, contentTo: from });
      opening = null;
    } else {
      opening = { from, size: match[0].length };
    }
  }
  return result;
}

function findLeaf(state: EditorState, position: number): MarkdownNode | null {
  const tree = ensureSyntaxTree(state, state.doc.length, 100) ?? syntaxTree(state);
  const line = state.doc.lineAt(position);
  for (let node: MarkdownNode | null = tree.resolve(position, -1); node; node = node.parent) {
    if (leafBlocks.test(node.name) && node.to >= line.from) return node;
  }
  let found: MarkdownNode | null = null;
  tree.iterate({
    from: line.from,
    to: line.to,
    enter(node) {
      if (leafBlocks.test(node.name) && node.from <= line.to && node.to >= position) {
        found = node.node;
        return false;
      }
    },
  });
  return found;
}

/** Remove only parsed markup, so literal punctuation in the source stays text. */
function inlineText(state: EditorState, block: MarkdownNode, from: number, to: number): PlainTail {
  const excluded: Array<{ from: number; to: number; insert?: string }> = [];
  const atoms: PlainTail["atoms"] = [];
  // Temporary placeholders cannot collide with document text and survive the text escaping below.
  let tokenPrefix = "\ue000mdmeow";
  while (state.doc.toString().includes(tokenPrefix)) tokenPrefix += "\ue000";
  const preserve = (start: number, end: number): void => {
    const token = `${tokenPrefix}${atoms.length}\ue001`;
    atoms.push({ token, text: state.doc.sliceString(start, end) });
    excluded.push({ from: start, to: end, insert: token });
  };
  const visit = (node: MarkdownNode): void => {
    if (node.to <= from || node.from >= to) return;
    if ((node.name === "Image" || node.name === "HTMLTag") && node.from >= from && node.to <= to) {
      preserve(node.from, node.to);
      return;
    }
    const span = inlineSpan(node);
    if (span) {
      excluded.push({ from: span.from, to: span.contentFrom }, { from: span.contentTo, to: span.to });
      // Backticks contain literal text, rather than nested Markdown syntax.
      if (node.name === "InlineCode") return;
    } else if (node.name === "QuoteMark" || node.name === "HeaderMark") {
      const separator = state.doc.sliceString(node.to, node.to + 1) === " " ? 1 : 0;
      excluded.push({ from: node.from, to: node.to + separator });
      return;
    } else if (node.name === "Escape") {
      excluded.push({ from: node.from, to: node.from + 1 });
      return;
    }
    for (const child of children(node)) visit(child);
  };
  visit(block);
  for (const span of inlineMathSpans(state, block)) {
    if (span.from >= from && span.to <= to) preserve(span.from, span.to);
    else excluded.push({ from: span.from, to: span.contentFrom }, { from: span.contentTo, to: span.to });
  }
  excluded.sort((a, b) => a.from - b.from || b.to - a.to);
  let result = "";
  let position = from;
  for (const range of excluded) {
    if (range.to <= from || range.from >= to) continue;
    const start = Math.max(from, range.from);
    const end = Math.min(to, range.to);
    if (start > position) result += state.doc.sliceString(position, start);
    if (range.insert && start >= position) result += range.insert;
    position = Math.max(position, end);
  }
  return { text: result + state.doc.sliceString(position, to), atoms };
}

function closingInlineMarkup(state: EditorState, block: MarkdownNode, position: number): string {
  const spans: InlineSpan[] = [];
  const visit = (node: MarkdownNode): void => {
    if (node.from >= position || node.to <= position) return;
    const span = inlineSpan(node);
    if (span && node.name !== "Autolink" && position > span.contentFrom && position <= span.contentTo) spans.push(span);
    for (const child of children(node)) visit(child);
  };
  visit(block);
  spans.push(...inlineMathSpans(state, block).filter((span) => position > span.contentFrom && position <= span.contentTo));
  return spans.sort((a, b) => b.from - a.from).map((span) => state.doc.sliceString(span.contentTo, span.to)).join("");
}

function inlinePrefixEnd(state: EditorState, block: MarkdownNode, position: number): number {
  const spans: InlineSpan[] = inlineMathSpans(state, block);
  const visit = (node: MarkdownNode): void => {
    if (node.from >= position || node.to <= position) return;
    const span = inlineSpan(node);
    if (span) spans.push(span);
    for (const child of children(node)) visit(child);
  };
  visit(block);
  let end = position;
  for (const span of spans.sort((a, b) => b.from - a.from)) {
    if (end >= span.contentFrom && end <= span.contentTo && !state.doc.sliceString(span.contentFrom, end).trim()) end = span.from;
  }
  return end;
}

/** Source attributes have no corresponding text caret in the rich editor. */
function safeInlinePosition(state: EditorState, block: MarkdownNode, position: number): number {
  for (let node: MarkdownNode | null = syntaxTree(state).resolve(position, -1); node && node.from >= block.from; node = node.parent) {
    if (position <= node.from || position >= node.to) continue;
    if (node.name === "Image" || node.name === "HTMLTag") return node.to;
    const span = node.name === "Link" ? inlineSpan(node) : null;
    if (span && (position < span.contentFrom || position > span.contentTo)) return node.to;
    if (node.name === block.name && node.from === block.from) break;
  }
  return position;
}

function formattedPrefix(state: EditorState, block: MarkdownNode | null, from: number, to: number): string {
  let prefix = state.doc.sliceString(from, to);
  if (!block) return prefix;
  for (let node: MarkdownNode | null = syntaxTree(state).resolve(to, -1); node; node = node?.parent ?? null) {
    const span = node.name === "Autolink" ? inlineSpan(node) : null;
    if (!span || to <= span.contentFrom || to > span.contentTo) continue;
    const url = state.doc.sliceString(span.contentFrom, span.contentTo);
    const destination = /^[^@\s]+@[^@\s]+$/.test(url) && !url.includes(":") ? `mailto:${url}` : url;
    const label = state.doc.sliceString(span.contentFrom, to).replace(/[\\\[\]]/g, "\\$&");
    prefix = state.doc.sliceString(from, span.from) + `[${label}](<${destination}>)`;
    return prefix;
  }
  // The source language uses CommonMark; Milkdown also recognizes bare GFM
  // links. Preserve their original destination when splitting their label.
  const text = state.doc.sliceString(block.from, block.to);
  const links = /(?<![\w\\])(?:https?:\/\/|www\.)[^\s<>]+|(?<![\w.+\-\\])[\w.+-]+@(?:[\w-]+\.)+[\w-]+/gi;
  for (const match of text.matchAll(links)) {
    const start = block.from + match.index;
    let label = match[0].replace(/[?!.,:*_~]+$/, "");
    while (label.endsWith(")") && (label.match(/\)/g)?.length ?? 0) > (label.match(/\(/g)?.length ?? 0)) label = label.slice(0, -1);
    if (to <= start || to > start + label.length) continue;
    let literal = false;
    for (let node: MarkdownNode | null = syntaxTree(state).resolve(start, 1); node; node = node.parent) {
      if (/^(?:InlineCode|Link|Image|HTMLTag|Autolink|Escape)$/.test(node.name)) literal = true;
    }
    if (literal) continue;
    const destination = label.startsWith("www.") ? `http://${label}`
      : !label.includes(":") && label.includes("@") ? `mailto:${label}` : label;
    const before = state.doc.sliceString(start, to).replace(/[\\\[\]]/g, "\\$&");
    prefix = state.doc.sliceString(from, start) + `[${before}](<${destination}>)`;
    break;
  }
  return prefix;
}

function containerPrefix(text: string): string {
  return text.match(/^(?:[ \t]*>[ \t]?)*[ \t]*/)?.[0] ?? "";
}

function stripContainerLines(text: string, container: string): string {
  return text.split("\n").map((line, index) =>
    index ? stripContainerPrefix(line, container) : line,
  ).join("\n");
}

function stripContainerPrefix(line: string, container: string): string {
  // Consume ancestors in their original order: a quote inside a list and a
  // list inside a quote have different continuation prefixes.
  for (const token of container.match(/>[ \t]?|\d+[.)][ \t]+|[*+-][ \t]+|[ \t]+/g) ?? []) {
    if (token.startsWith(">")) line = line.replace(/^>[ \t]?/, "");
    else {
      let remaining = token.length;
      while (remaining-- > 0 && /^[ \t]/.test(line)) line = line.slice(1);
    }
  }
  return line;
}

function plainMarkdown(tail: PlainTail, container: string): string {
  const text = stripContainerLines(tail.text, container);
  // Text moved out of a code/math block must not turn into fresh Markdown markup.
  const escaped = text.replace(/[\\`*_\[\]<>~$]/g, "\\$&");
  let result = escaped.split("\n").map((line) =>
    // Character references preserve intentional text indentation without creating an indented code block.
    line.replace(/^[ \t]+/, (space) => space.replace(/ /g, "&#32;").replace(/\t/g, "&#9;"))
      .replace(/^(#{1,6}(?=\s|$)|[+\-=](?=\s|$))/, "\\$&")
      .replace(/^(\d{1,9})([.)])(?=\s|$)/, "$1\\$2"),
  ).join("\n");
  for (const atom of tail.atoms) result = result.replace(atom.token, () => atom.text);
  return result;
}

function mathBlock(state: EditorState, position: number): SplitBlock | null {
  const current = state.doc.lineAt(position);
  let opening: { from: number; to: number; prefix: string } | null = null;
  for (let number = 1; number <= state.doc.lines; number++) {
    const line = state.doc.line(number);
    const prefix = containerPrefix(line.text);
    const text = line.text.slice(prefix.length);
    // Math is a Milkdown extension and does not appear in CodeMirror's CommonMark tree.
    const single = text.match(/^\$\$([^]*?)\$\$[ \t]*$/);
    if (single && line.number === current.number) {
      const start = line.from + prefix.length + 2;
      const end = start + single[1].length;
      const split = Math.max(start, Math.min(position, end));
      return {
        from: line.from,
        to: line.to,
        position: split,
        prefix: `${prefix}$$\n${prefix}${state.doc.sliceString(start, split)}\n${prefix}$$`,
        tail: textTail(state.doc.sliceString(split, end)),
        container: prefix,
      };
    }
    if (!/^\$\$[ \t]*$/.test(text)) continue;
    const leaf = findLeaf(state, line.from + prefix.length);
    if (leaf?.name === "FencedCode" || leaf?.name === "CodeBlock") continue;
    if (!opening) {
      opening = { from: line.from, to: line.to, prefix };
    } else {
      if (position >= opening.from && position <= line.to) {
        const start = Math.min(opening.to + 1, state.doc.length);
        const end = Math.max(start, line.from - 1);
        const split = Math.max(start, Math.min(position, end));
        const before = state.doc.sliceString(opening.from, split);
        return {
          from: opening.from,
          to: line.to,
          position: split,
          prefix: `${before}${before.endsWith("\n") ? "" : "\n"}${opening.prefix}$$`,
          tail: textTail(state.doc.sliceString(split, end)),
          container: opening.prefix,
        };
      }
      opening = null;
    }
    if (line.from > position && !opening) break;
  }
  if (opening && position >= opening.from) {
    const split = Math.max(Math.min(opening.to + 1, state.doc.length), position);
    const before = state.doc.sliceString(opening.from, split);
    return {
      from: opening.from,
      to: state.doc.length,
      position: split,
      prefix: `${before}${before.endsWith("\n") ? "" : "\n"}${opening.prefix}$$`,
      tail: textTail(state.doc.sliceString(split)),
      container: opening.prefix,
    };
  }
  return null;
}

function splitBlock(state: EditorState, position: number): SplitBlock {
  const leaf = findLeaf(state, position);
  const atomic = atomicBlock(state, leaf, position);
  if (atomic) return atomic;
  if (leaf) position = safeInlinePosition(state, leaf, position);
  if (leaf?.name !== "FencedCode" && leaf?.name !== "CodeBlock") {
    const math = mathBlock(state, position);
    if (math) return math;
  }
  const line = state.doc.lineAt(position);
  const from = leaf ? state.doc.lineAt(leaf.from).from : line.from;
  let to = leaf?.to ?? line.to;
  if (leaf?.name === "Paragraph") {
    // CommonMark sees math as paragraph text, while Milkdown treats it as a separate block.
    for (let number = line.number + 1; number <= state.doc.lineAt(to).number; number++) {
      const next = state.doc.line(number);
      if (/^\$\$/.test(next.text.slice(containerPrefix(next.text).length))) {
        to = state.doc.line(number - 1).to;
        break;
      }
    }
  }
  if (leaf?.name === "FencedCode") {
    const marks = children(leaf).filter((child) => child.name === "CodeMark");
    const opening = marks[0];
    const closing = marks[marks.length - 1];
    const firstLine = state.doc.lineAt(opening?.from ?? leaf.from);
    const hasClosing = marks.length > 1;
    const end = hasClosing ? Math.max(firstLine.to + 1, state.doc.lineAt(closing.from).from - 1) : to;
    const start = Math.min(firstLine.to + 1, state.doc.length);
    const split = Math.max(start, Math.min(position, end));
    const before = state.doc.sliceString(from, split);
    const mark = opening ? state.doc.sliceString(opening.from, opening.to) : "```";
    const endMarker = hasClosing ? state.doc.lineAt(closing.from).text : containerPrefix(firstLine.text) + mark;
    return {
      from,
      to,
      position: split,
      prefix: `${before}${before.endsWith("\n") ? "" : "\n"}${endMarker}`,
      tail: textTail(state.doc.sliceString(split, end)),
      container: state.doc.sliceString(firstLine.from, opening?.from ?? leaf.from),
    };
  }
  if (leaf?.name.startsWith("SetextHeading")) {
    const underline = children(leaf).find((child) => child.name === "HeaderMark");
    if (underline) position = Math.min(position, state.doc.lineAt(underline.from).from - 1);
  }
  const prefixEnd = leaf && leaf.name !== "CodeBlock" ? inlinePrefixEnd(state, leaf, position) : position;
  const prefix = formattedPrefix(state, leaf, from, prefixEnd);
  let tail = leaf?.name === "CodeBlock" || !leaf
    ? textTail(state.doc.sliceString(position, to))
    : inlineText(state, leaf, position, to);
  let closed = leaf && leaf.name !== "CodeBlock" ? closingInlineMarkup(state, leaf, prefixEnd) : "";
  if (leaf?.name.startsWith("SetextHeading")) {
    // Keep the underline with the old heading instead of carrying it into the new paragraph.
    const underline = children(leaf).find((child) => child.name === "HeaderMark");
    if (underline) {
      const contentTo = state.doc.lineAt(underline.from).from - 1;
      tail = inlineText(state, leaf, Math.min(position, contentTo), contentTo);
      closed += `\n${state.doc.sliceString(underline.from, underline.to)}`;
    }
  }
  return { from, to, position, prefix: prefix + closed, tail, container: leaf ? state.doc.sliceString(from, leaf.from) : containerPrefix(line.text) };
}

/** Tables and rules cannot be split into a paragraph without breaking their syntax. */
function atomicBlock(state: EditorState, leaf: MarkdownNode | null, position: number): SplitBlock | null {
  let atom: MarkdownNode | null = null;
  if (leaf?.name === "Paragraph") {
    const first = state.doc.lineAt(leaf.from);
    const container = state.doc.sliceString(first.from, leaf.from);
    for (let number = first.number + 1; number <= state.doc.lineAt(leaf.to).number; number++) {
      const delimiter = state.doc.line(number);
      const text = stripContainerPrefix(delimiter.text, container).trim();
      if (!text.includes("|")) continue;
      const cells = text.replace(/^\||\|$/g, "").split("|");
      if (cells.every((cell) => /^\s*:?-+:?\s*$/.test(cell)) && position >= state.doc.line(number - 1).from) {
        atom = leaf;
        break;
      }
    }
  } else if (!leaf) {
    const line = state.doc.lineAt(position);
    syntaxTree(state).iterate({
      from: line.from,
      to: line.to,
      enter(node) {
        if (node.name === "HorizontalRule") atom = node.node;
      },
    });
  }
  if (!atom) return null;
  let top: MarkdownNode = atom;
  while (top.parent && top.parent.name !== "Document") top = top.parent;
  const from = state.doc.lineAt(top.from).from;
  return {
    from, to: top.to, position: top.to,
    prefix: state.doc.sliceString(from, top.to),
    tail: textTail(""), container: "",
  };
}

interface RemainingBlock {
  kind: string;
  markdown: string;
}

function originalBlock(state: EditorState, node: MarkdownNode, from = node.from): RemainingBlock {
  const first = state.doc.lineAt(node.from);
  const container = state.doc.sliceString(first.from, node.from);
  const start = state.doc.lineAt(from);
  const lines: string[] = [];
  for (let number = start.number; number <= state.doc.lineAt(node.to).number; number++) {
    const line = state.doc.line(number);
    const text = state.doc.sliceString(Math.max(from, line.from), Math.min(node.to, line.to));
    lines.push(number === start.number && from === node.from ? text : stripContainerPrefix(text, container));
  }
  return { kind: node.name, markdown: lines.join("\n").replace(/^\n+|\n+$/g, "") };
}

function changeItemMarker(markdown: string, marker: string): string {
  const previous = markdown.match(/^(?:[*+-]|\d+[.)])(?=[ \t]|$)/)?.[0];
  if (!previous) return markdown;
  const difference = marker.length - previous.length;
  return markdown.split("\n").map((line, index) => {
    if (!index) return marker + line.slice(previous.length);
    if (!line || !difference) return line;
    if (difference > 0) return " ".repeat(difference) + line;
    return line.replace(new RegExp(`^[ \\t]{0,${-difference}}`), "");
  }).join("\n");
}

function joinRemaining(blocks: RemainingBlock[]): string {
  let previous: RemainingBlock | null = null;
  return blocks.map((block) => {
    let markdown = block.markdown;
    // Distinct lists released from different ancestors must remain distinct
    // Markdown lists even when both use the same kind of marker.
    if (previous?.kind === block.kind && /^(?:BulletList|OrderedList)$/.test(block.kind)) {
      if (block.kind === "BulletList") {
        const lastMarker = previous.markdown.match(/^[*+-]/)?.[0];
        const marker = lastMarker === "*" ? "-" : "*";
        markdown = markdown.replace(/^[*+-](?=[ \t])/gm, marker);
      } else {
        const lastDelimiter = previous.markdown.match(/^\d+([.)])/)?.[1];
        const delimiter = lastDelimiter === "." ? ")" : ".";
        markdown = markdown.replace(/^(\d+)[.)](?=[ \t])/gm, `$1${delimiter}`);
      }
    }
    previous = { ...block, markdown };
    return markdown;
  }).join("\n\n");
}

/** Rebuild only the suffix of the current container, preserving sibling blocks. */
function remainingContainers(state: EditorState, block: SplitBlock): { to: number; markdown: string } {
  const leaf = findLeaf(state, block.position);
  if (!leaf) return { to: block.to, markdown: "" };
  let current = leaf;
  let remaining: RemainingBlock[] = [];
  if (block.to < leaf.to) {
    const suffix = originalBlock(state, leaf, block.to + 1);
    if (suffix.markdown) remaining.push(suffix);
  }
  while (current.parent && current.parent.name !== "Document") {
    const parent = current.parent;
    const siblings = children(parent).filter((node) => node.name !== "QuoteMark" && node.name !== "ListMark");
    const index = siblings.findIndex((node) => node.from === current.from && node.to === current.to && node.name === current.name);
    const continuesItem = remaining.some((node) => node.kind === "ListItem");
    remaining.push(...siblings.slice(index + 1).map((node) => originalBlock(state, node)));
    if (parent.name === "ListItem" && remaining[0]?.kind === "Paragraph") {
      const markerNode = parent.getChild("ListMark");
      const marker = markerNode ? state.doc.sliceString(markerNode.from, markerNode.to) : "-";
      const firstParagraph = parent.getChild("Paragraph");
      const task = firstParagraph
        ? state.doc.sliceString(firstParagraph.from, firstParagraph.to).match(/^\[[ xX]\][ \t]+/)?.[0] ?? ""
        : "";
      const prefix = `${marker} ${task}`;
      const content = joinRemaining(remaining).split("\n").map((line, i) =>
        i === 0 ? prefix + line : line ? " ".repeat(marker.length + 1) + line : "",
      ).join("\n");
      remaining = [{ kind: "ListItem", markdown: content }];
    } else if (parent.name === "BulletList" || parent.name === "OrderedList") {
      const firstItem = siblings[0];
      const firstMarker = firstItem?.getChild("ListMark");
      const originalMarker = firstMarker ? state.doc.sliceString(firstMarker.from, firstMarker.to) : "-";
      let order = Number.parseInt(originalMarker) || 1;
      order += index + (continuesItem ? 0 : 1);
      const delimiter = originalMarker.endsWith(")") ? ")" : ".";
      const grouped: RemainingBlock[] = [];
      let items: string[] = [];
      const flush = (): void => {
        if (items.length) grouped.push({ kind: parent.name, markdown: items.join("\n") });
        items = [];
      };
      for (const piece of remaining) {
        if (piece.kind === "ListItem") {
          const marker = parent.name === "OrderedList" ? `${order++}${delimiter}` : originalMarker;
          items.push(changeItemMarker(piece.markdown, marker));
        } else {
          flush();
          grouped.push(piece);
        }
      }
      flush();
      remaining = grouped;
    } else if (parent.name === "Blockquote" && remaining.length) {
      remaining = [{
        kind: "Blockquote",
        markdown: joinRemaining(remaining).split("\n").map((line) => line ? `> ${line}` : ">").join("\n"),
      }];
    }
    current = parent;
  }
  return { to: Math.max(block.to, current.to), markdown: joinRemaining(remaining) };
}

/** Build one undoable change; the application owns the configurable shortcut. */
export function plainParagraphTransaction(state: EditorState): TransactionSpec {
  const range = state.selection.main;
  const deletion = state.update({
    changes: range.empty ? [] : { from: range.from, to: range.to },
    selection: EditorSelection.cursor(range.from),
  });
  const edited = deletion.state;
  const block = splitBlock(edited, range.from);
  const tail = plainMarkdown(block.tail, block.container);
  const remaining = remainingContainers(edited, block);
  const nextLine = remaining.to < edited.doc.length ? edited.doc.lineAt(remaining.to + 1) : null;
  const separator = nextLine && nextLine.text.trim() ? "\n" : "";
  const suffix = remaining.markdown ? `\n\n${remaining.markdown}` : "";
  const replacement = `${block.prefix}\n\n${tail}${suffix}${separator}`;
  const split = edited.update({
    changes: { from: block.from, to: remaining.to, insert: Text.of(replacement.split("\n")) },
  });
  return {
    changes: deletion.changes.compose(split.changes),
    selection: EditorSelection.cursor(block.from + block.prefix.length + 2),
    annotations: [Transaction.userEvent.of("input.plainParagraph"), isolateHistory.of("full")],
    scrollIntoView: true,
  };
}
