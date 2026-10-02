// Emoji support: a `:shortcode:` input rule for the WYSIWYG editor and a small
// searchable picker component. Native Unicode glyphs only — the data lives
// in emoji-data.ts. The input rule remains available without a global picker
// shortcut.

import { $prose } from "@milkdown/kit/utils";
import { InputRule, inputRules } from "@milkdown/kit/prose/inputrules";

import { EMOJI, BY_SHORTCODE, type EmojiEntry } from "./emoji-data";
import { t } from "./i18n";

// --- `:shortcode:` input rule -------------------------------------------------

/**
 * Replace `:name:` with its emoji as soon as the closing colon is typed.
 * Unknown names are left as plain text. Same plugin class as `findPlugin`
 * (src/find.ts) — no runtime cost unless a `:…:` sits right before the cursor.
 */
const rule = new InputRule(
  /(?::|：)([a-z0-9_+-]{1,32})(?::|：)$/i,
  (state, match, start, end) => {
    const glyph = BY_SHORTCODE.get(match[1].toLowerCase());
    if (!glyph) return null;
    return state.tr.insertText(glyph, start, end);
  },
);

export const emojiInputRule = $prose(() => inputRules({ rules: [rule] }));

// --- picker -----------------------------------------------------------------

const RECENT_FALLBACK = [
  "tada", "rocket", "fire", "+1", "-1", "heart", "eyes", "white_check_mark",
  "x", "warning", "bulb", "bug", "sparkles", "pray", "100", "thinking",
  "joy", "raised_hands", "point_right", "memo", "star", "clap", "wave", "ok_hand",
];

const MAX_RESULTS = 48;
const COLS = 8;

function score(entry: EmojiEntry, q: string): number {
  const n = entry.n;
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (n.includes(q)) return 2;
  if (entry.k.split(" ").some((w) => w.startsWith(q))) return 3;
  if (entry.k.includes(q)) return 4;
  return -1;
}

function search(query: string): EmojiEntry[] {
  const q = query.trim().toLowerCase().replace(/^:+|:+$/g, "");
  if (!q) {
    return RECENT_FALLBACK.map((n) => EMOJI.find((e) => e.n === n)).filter(
      (e): e is EmojiEntry => !!e,
    );
  }
  const hits: { entry: EmojiEntry; s: number }[] = [];
  for (const entry of EMOJI) {
    const s = score(entry, q);
    if (s >= 0) hits.push({ entry, s });
  }
  hits.sort((a, b) => a.s - b.s || a.entry.n.length - b.entry.n.length);
  return hits.slice(0, MAX_RESULTS).map((h) => h.entry);
}

export class EmojiPicker {
  #el: HTMLElement;
  #input: HTMLInputElement;
  #grid: HTMLElement;
  #results: EmojiEntry[] = [];
  #sel = 0;
  #open = false;

  /** Called with the chosen glyph. */
  onPick: (glyph: string) => void = () => {};
  /** Return focus to the underlying view after closing. */
  onClose: () => void = () => {};

  constructor() {
    this.#el = document.createElement("div");
    this.#el.id = "emoji-picker";
    this.#el.hidden = true;
    this.#el.innerHTML = `
      <input type="text" class="emoji-search" spellcheck="false" autocomplete="off" />
      <div class="emoji-grid" role="listbox"></div>`;
    document.body.appendChild(this.#el);

    this.#input = this.#el.querySelector<HTMLInputElement>(".emoji-search")!;
    this.#grid = this.#el.querySelector<HTMLElement>(".emoji-grid")!;
    this.retranslate();

    this.#input.addEventListener("input", () => this.#render(search(this.#input.value)));
    this.#input.addEventListener("keydown", this.#onKey);
    this.#grid.addEventListener("click", this.#onGridClick);
    document.addEventListener("pointerdown", this.#onPointerDown, true);
  }

  get isOpen(): boolean {
    return this.#open;
  }

  /** Refresh visible text after a language change. */
  retranslate(): void {
    this.#input.placeholder = t("emoji.search");
    this.#input.setAttribute("aria-label", t("emoji.search"));
    if (this.#open) this.#render(search(this.#input.value));
  }

  open(anchor: DOMRect | null): void {
    this.#el.hidden = false;
    this.#open = true;
    this.#input.value = "";
    this.#render(search(""));
    this.#position(anchor);
    this.#input.focus();
  }

  close(): void {
    if (!this.#open) return;
    this.#open = false;
    this.#el.hidden = true;
    this.onClose();
  }

  #position(anchor: DOMRect | null): void {
    const w = this.#el.offsetWidth || 320;
    const h = this.#el.offsetHeight || 300;
    let left: number;
    let top: number;
    if (anchor) {
      left = anchor.left;
      top = anchor.bottom + 6;
      if (top + h > window.innerHeight) top = anchor.top - h - 6;
    } else {
      left = (window.innerWidth - w) / 2;
      top = 80;
    }
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
    this.#el.style.left = `${left}px`;
    this.#el.style.top = `${top}px`;
  }

  #render(results: EmojiEntry[]): void {
    this.#results = results;
    this.#sel = 0;
    this.#grid.replaceChildren();
    results.forEach((entry, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "emoji-cell" + (i === 0 ? " sel" : "");
      btn.textContent = entry.e;
      btn.title = `:${entry.n}:`;
      btn.dataset.i = String(i);
      this.#grid.appendChild(btn);
    });
    if (!results.length) {
      const empty = document.createElement("div");
      empty.className = "emoji-empty";
      empty.textContent = t("emoji.noMatches");
      this.#grid.appendChild(empty);
    }
  }

  #move(delta: number): void {
    if (!this.#results.length) return;
    const next = Math.max(0, Math.min(this.#results.length - 1, this.#sel + delta));
    if (next === this.#sel) return;
    this.#grid.children[this.#sel]?.classList.remove("sel");
    this.#sel = next;
    const cell = this.#grid.children[this.#sel] as HTMLElement | undefined;
    cell?.classList.add("sel");
    cell?.scrollIntoView({ block: "nearest" });
  }

  #pick(i: number): void {
    const entry = this.#results[i];
    if (!entry) return;
    this.close();
    this.onPick(entry.e);
  }

  #onKey = (e: KeyboardEvent): void => {
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        this.close();
        break;
      case "Enter":
        e.preventDefault();
        this.#pick(this.#sel);
        break;
      case "ArrowRight":
        e.preventDefault();
        this.#move(1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        this.#move(-1);
        break;
      case "ArrowDown":
        e.preventDefault();
        this.#move(COLS);
        break;
      case "ArrowUp":
        e.preventDefault();
        this.#move(-COLS);
        break;
    }
  };

  #onGridClick = (e: Event): void => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-i]");
    if (btn) this.#pick(Number(btn.dataset.i));
  };

  #onPointerDown = (e: Event): void => {
    if (!this.#open) return;
    if (!this.#el.contains(e.target as Node)) this.close();
  };
}
