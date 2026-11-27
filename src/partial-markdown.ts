/** Preserve source fragments that Crepe cannot faithfully round-trip.
 *
 * The sentinel is runtime-only. It must never be written to the user's file.
 * Only tokens issued for the current document can be restored.
 */
export interface ProtectedFragment {
  start: number;
  end: number;
}
export const PROTECTION_TOKEN_PATTERN = /<mdmeow-parse-error data-id="[a-z0-9-]+" \/>/g;

export function makeProtectionToken(source: string, originals: Map<string, string>): string {
  const token = '<mdmeow-parse-error data-id="' + crypto.randomUUID() + '" />';
  originals.set(token, source);
  return token;
}

export function restoreProtectedFragments(markdown: string, originals: Map<string, string>): string {
  return markdown.replace(PROTECTION_TOKEN_PATTERN, (token) => originals.get(token) ?? token);
}

interface MarkdownNode {
  type: string;
  position?: { start: { offset?: number }; end: { offset?: number } };
  children?: readonly MarkdownNode[];
}

export function findKnownUnsafeFragments(
  source: string,
  parse: (source: string) => MarkdownNode,
): ProtectedFragment[] {
  const fragments: ProtectedFragment[] = [];
  // A leading thematic break is ordinary Markdown. Only mask a closed
  // metadata block whose first non-comment content starts like YAML metadata.
  const header = /^---[ \t]*(?:\r\n|\r|\n)([\s\S]*?)^(?:---|\.\.\.)[ \t]*(?=\r?$|\r)/m;
  const match = source.startsWith("---") ? header.exec(source) : null;
  const first = match?.[1].split(/\r\n?|\n/).map(line => line.trim())
    .find(line => line && !line.startsWith("#"));
  const offset = match?.index === 0 && (!match[1].trim() ||
    (first !== undefined && /^(?:[^:[\]{}]+:(?:\s|$)|[{\[]|-\s)/.test(first)))
    ? match[0].length : 0;
  if (offset) fragments.push({ start: 0, end: offset });
  if (!source.includes("[")) return fragments;

  // remark already distinguishes reference uses/definitions from identically
  // spelled text inside fenced, indented and inline code, including nested blocks.
  function visit(node: MarkdownNode): void {
    if (["definition", "linkReference", "imageReference"].includes(node.type)) {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start !== undefined && end !== undefined) {
        fragments.push({ start: offset + start, end: offset + end });
      }
      return;
    }
    node.children?.forEach(visit);
  }
  visit(parse(source.slice(offset)));
  return fragments;
}

export function maskFragments(
  source: string, fragments: ProtectedFragment[], originals: Map<string, string>,
): string {
  const sorted = [...fragments].sort((a, b) => a.start - b.start);
  let output = "";
  let cursor = 0;
  for (const item of sorted) {
    if (item.start < cursor || item.end <= item.start || item.end > source.length) continue;
    output += source.slice(cursor, item.start);
    output += makeProtectionToken(source.slice(item.start, item.end), originals);
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
