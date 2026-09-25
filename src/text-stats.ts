const CJK_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const WORD_CHAR = /[\p{L}\p{N}_]/u;

/**
 * Count human-readable text units for the small editor counter.
 *
 * CJK characters count individually, while Latin/number/underscore runs count
 * as words. Whitespace and punctuation do not add to the count. This keeps the
 * number intuitive for both Chinese/Japanese prose and space-delimited text.
 */
export function countTextUnits(text: string): number {
  let count = 0;
  let inWord = false;

  for (const char of text) {
    if (CJK_CHAR.test(char)) {
      count += 1;
      inWord = false;
      continue;
    }
    if (WORD_CHAR.test(char)) {
      if (!inWord) count += 1;
      inWord = true;
      continue;
    }
    inWord = false;
  }

  return count;
}
