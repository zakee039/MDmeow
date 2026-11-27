// In-document heading anchor scrolling and href classification for both
// Markdown links (`<a>`) and safe raw-HTML links (`[data-mdmeow-href]`).

export type ClassifiedHref =
  | { kind: "ignore" }
  | { kind: "blocked" }
  | { kind: "anchor"; hash: string }
  | { kind: "external"; url: string }
  | { kind: "local"; href: string };

const SAFE_EXTERNAL_RE = /^(?:https?:|mailto:)/i;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

export function classifyHref(rawHref: string | null | undefined): ClassifiedHref {
  const trimmed = (rawHref ?? "").trim();
  if (!trimmed) return { kind: "ignore" };
  if (trimmed.startsWith("#")) return { kind: "anchor", hash: trimmed };
  if (SAFE_EXTERNAL_RE.test(trimmed)) return { kind: "external", url: trimmed };
  if (trimmed.startsWith("//") || SCHEME_RE.test(trimmed)) {
    return { kind: "blocked" };
  }
  return { kind: "local", href: trimmed };
}

/** GitHub-compatible heading slug (matches `github-slugger`). */
export function githubHeadingSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/g, "-");
}

/** Relaxed heading slug that collapses punctuation runs to `-`, matching
 *  hand-written or markdown-it style TOC links (e.g. `8. A、B` -> `8-a-b`). */
export function relaxedHeadingSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function safeDecodeFragment(raw: string): string {
  const stripped = raw.replace(/^#/, "").trim();
  try {
    return decodeURIComponent(stripped);
  } catch {
    return stripped;
  }
}

function flashTarget(el: HTMLElement): void {
  el.classList.remove("mdmeow-anchor-flash");
  void el.offsetWidth;
  el.classList.add("mdmeow-anchor-flash");
  window.setTimeout(() => {
    el.classList.remove("mdmeow-anchor-flash");
  }, 1400);
}

/** Scroll smoothly to the heading (or explicit `id` element) matching `rawHash`
 *  inside `container`. Returns `true` if a target was found and scrolled to. */
export function scrollToHeadingAnchor(container: HTMLElement, rawHash: string): boolean {
  const decoded = safeDecodeFragment(rawHash);
  if (!decoded) {
    container.scrollTo({ top: 0, behavior: "smooth" });
    return true;
  }
  const targetLower = decoded.toLowerCase();

  // 1. Explicit DOM id inside the editor document.
  for (const el of container.querySelectorAll<HTMLElement>("[id]")) {
    if (el.id.toLowerCase() === targetLower) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      flashTarget(el);
      return true;
    }
  }

  const headings = Array.from(
    container.querySelectorAll<HTMLElement>(".ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6"),
  );
  if (headings.length === 0) return false;

  // 2. Exact GitHub-slugger match (with `-1`, `-2` dedupe suffixes).
  const seen = new Map<string, number>();
  for (const heading of headings) {
    const base = githubHeadingSlug(heading.textContent ?? "");
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const slug = count === 0 ? base : `${base}-${count}`;
    if (slug === targetLower) {
      heading.scrollIntoView({ behavior: "smooth", block: "start" });
      flashTarget(heading);
      return true;
    }
  }

  // 3. Relaxed punctuation-collapsed fallback match.
  const relaxedTarget = relaxedHeadingSlug(decoded);
  if (relaxedTarget) {
    const seenRelaxed = new Map<string, number>();
    for (const heading of headings) {
      const base = relaxedHeadingSlug(heading.textContent ?? "");
      const count = seenRelaxed.get(base) ?? 0;
      seenRelaxed.set(base, count + 1);
      const slug = count === 0 ? base : `${base}-${count}`;
      if (slug === relaxedTarget) {
        heading.scrollIntoView({ behavior: "smooth", block: "start" });
        flashTarget(heading);
        return true;
      }
    }
  }

  return false;
}
