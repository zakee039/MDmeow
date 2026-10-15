/** Preserve source fragments that Crepe cannot faithfully round-trip.
 *
 * The sentinel is runtime-only. It must never be written to the user's file.
 * Encoded payloads make a protected block self-contained across tab switches.
 */
export interface ProtectedFragment {
  start: number;
  end: number;
}
const TOKEN_PATTERN = /<mdmeow-parse-error data-raw="([A-Za-z0-9+/=]+)"\s*\/>/g;

export function makeProtectionToken(source: string): string {
  const encoded = new TextEncoder().encode(source);
  let bytes = "";
  for (const b of encoded) bytes += String.fromCharCode(b);
  return `<mdmeow-parse-error data-raw="${btoa(bytes)}" />`;
}

export function restoreProtectedFragments(markdown: string): string {
  return markdown.replace(TOKEN_PATTERN, (_match, encoded: string) => {
    try {
      const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      // Treat a damaged payload as literal source rather than silently deleting it.
      return _match;
    }
  });
}

export function protectionTokenCount(markdown: string): number {
  return [...markdown.matchAll(TOKEN_PATTERN)].length;
}

export function findKnownUnsafeFragments(markdown: string): ProtectedFragment[] {
  const result: ProtectedFragment[] = [];
  const lines: { text: string; start: number; end: number }[] = [];
  const linePattern = /[^\r\n]*(?:\r\n|\r|\n|$)/g;
  for (const m of markdown.matchAll(linePattern)) {
    if (!m[0]) continue;
    lines.push({
      text: m[0].replace(/(?:\r\n|\r|\n)$/, ""),
      start: m.index,
      end: m.index + m[0].length - (m[0].match(/(?:\r\n|\r|\n)$/)?.[0].length ?? 0),
    });
  }
  let index = 0;
  if (lines.length && /^\uFEFF?---[ \t]*$/.test(lines[0].text)) {
    for (let i = 1; i < lines.length; i++) {
      if (/^(?:---|\.\.\.)[ \t]*$/.test(lines[i].text)) {
        result.push({ start: 0, end: lines[i].end });
        index = i + 1;
        break;
      }
    }
  }

  // Definitions are already protected; their *uses* must be protected as
  // well. Otherwise Crepe sees an unresolved [label][id], converts it to
  // escaped plain text, and saving silently destroys the original link.
  const referenceLabels = new Set<string>();
  for (const line of lines) {
    const match = line.text.match(/^ {0,3}\[([^\]\r\n]+)\]:[ \t]*\S/);
    if (match) referenceLabels.add(match[1].trim().replace(/\s+/g, " ").toLowerCase());
  }

  let fence: { mark: string; min: number } | null = null;
  for (let i = index; i < lines.length; i++) {
    const line = lines[i];
    const openFence = line.text.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {
      const close = line.text.match(/^ {0,3}(`+|~+)[ \t]*$/);
      if (close && close[1][0] === fence.mark && close[1].length >= fence.min) fence = null;
      continue;
    }
    if (openFence) {
      fence = { mark: openFence[1][0], min: openFence[1].length };
      continue;
    }
    // Reference-style links are rewritten or discarded by Crepe's parser.
    // Protect the entire definition line (including the URL and title).
    if (/^ {0,3}\[[^\]\r\n]+\]:[ \t]*\S/.test(line.text)) {
      result.push({ start: line.start, end: line.end });
      continue;
    }
    if (!referenceLabels.size) continue;
    // Backtick code spans are literal text, even when a reference ID with the
    // same spelling exists elsewhere in the document.
    const codeRanges: Array<[number, number]> = [];
    for (const match of line.text.matchAll(/(`+)[^`]*?\1/g)) {
      codeRanges.push([match.index, match.index + match[0].length]);
    }
    const insideCode = (from: number, end: number): boolean =>
      codeRanges.some(([start, stop]) => from >= start && end <= stop);
    // Full and collapsed references, including image references, are single
    // opaque source spans. Keep ordinary links such as [x](url) editable.
    const fullReference = /!?\[([^\]\r\n]+)\]\[([^\]\r\n]*)\]/g;
    const occupied: Array<[number, number]> = [];
    for (const match of line.text.matchAll(fullReference)) {
      const from = match.index;
      if ((from > 0 && line.text[from - 1] === "\\") || insideCode(from, from + match[0].length)) continue;
      const label = (match[2] || match[1]).trim().replace(/\s+/g, " ").toLowerCase();
      if (!referenceLabels.has(label)) continue;
      result.push({ start: line.start + from, end: line.start + from + match[0].length });
      occupied.push([from, from + match[0].length]);
    }
    // Shortcut references [id] are meaningful only when defined. Do not
    // confuse them with the label portion of [label](url), or fenced code.
    for (const match of line.text.matchAll(/!?\[([^\]\r\n]+)\]/g)) {
      const from = match.index;
      const end = from + match[0].length;
      if (occupied.some(([a,b]) => from >= a && from < b)) continue;
      if ((from > 0 && line.text[from - 1] === "\\") || insideCode(from, end)) continue;
      if (line.text[end] === "(" || line.text[end] === "[" || line.text[end] === ":") continue;
      if (!referenceLabels.has(match[1].trim().replace(/\s+/g, " ").toLowerCase())) continue;
      result.push({ start: line.start + from, end: line.start + end });
    }
  }
  return result;
}

export function maskFragments(source: string, fragments: ProtectedFragment[]): string {
  const sorted = [...fragments].sort((a, b) => a.start - b.start);
  let output = "";
  let cursor = 0;
  for (const item of sorted) {
    if (item.start < cursor || item.end <= item.start || item.end > source.length) continue;
    output += source.slice(cursor, item.start);
    output += makeProtectionToken(source.slice(item.start, item.end));
    cursor = item.end;
  }
  return output + source.slice(cursor);
}

/** Recover top-level Markdown paragraphs for trying localized fallback.
 * The boundaries stay in the source; only a paragraph body is replaced. */
export function candidateParagraphs(source: string): ProtectedFragment[] {
  const results: ProtectedFragment[] = [];
  const divider = /(?:\r\n|\r|\n)[ \t]*(?:\r\n|\r|\n)/g;
  let start = 0;
  for (const match of source.matchAll(divider)) {
    if (match.index > start) results.push({ start, end: match.index });
    start = match.index + match[0].length;
  }
  if (start < source.length) results.push({ start, end: source.length });
  return results.filter(({ start, end }) => !source.slice(start, end).includes("<mdmeow-parse-error"));
}
