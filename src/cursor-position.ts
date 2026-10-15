/** Best-effort caret matching across Markdown source and rich-text nodes.
 * Only an actual text match is considered a cursor restoration; callers
 * retain the outgoing scroll fraction when no match is possible. */
export interface CursorAnchor {
  before: string;
  after: string;
  fraction: number;
  viewportY: number;
}

export function matchingPositions(
  text: string,
  anchor: CursorAnchor,
): Array<{ offset: number; score: number }> {
  const results: Array<{ offset: number; score: number }> = [];
  const candidates: Array<[string, boolean]> = [];
  for (const width of [24, 16, 9, 4]) {
    if (anchor.before.length >= width) candidates.push([anchor.before.slice(-width), true]);
    if (anchor.after.length >= width) candidates.push([anchor.after.slice(0, width), false]);
  }
  // Too-short snippets (e.g. one-letter words) are ambiguous across a
  // document; prefer the caller's scroll-position fallback instead.

  for (const [needle, isBefore] of candidates) {
    let from = 0;
    let count = 0;
    while (from < text.length && count++ < 200) {
      const found = text.indexOf(needle, from);
      if (found < 0) break;
      const offset = found + (isBefore ? needle.length : 0);
      const nearby = isBefore ? anchor.after : anchor.before;
      const adjacent = isBefore
        ? text.slice(offset, offset + nearby.length)
        : text.slice(Math.max(0, offset - nearby.length), offset);
      const verified = nearby
        ? isBefore ? nearby.startsWith(adjacent) && adjacent.length > 1
          : nearby.endsWith(adjacent) && adjacent.length > 1
        : false;
      results.push({ offset, score: needle.length * 2 + (verified ? 22 : 0) });
      from = found + 1;
    }
  }
  return results;
}

export function bestCursorOffset(text: string, anchor: CursorAnchor): number | null {
  const options = matchingPositions(text, anchor);
  if (!options.length) return null;
  const expected = anchor.fraction * text.length;
  options.sort((a, b) =>
    (b.score - Math.abs(b.offset - expected) / Math.max(text.length, 1) * 12) -
    (a.score - Math.abs(a.offset - expected) / Math.max(text.length, 1) * 12));
  return options[0].offset;
}
