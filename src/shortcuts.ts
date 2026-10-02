import { defaultKeymap, historyKeymap, indentWithTab } from "@codemirror/commands";

export type ShortcutAction =
  | "new_tab"
  | "open"
  | "save"
  | "save_as"
  | "close_tab"
  | "toggle_source"
  | "find"
  | "replace"
  | "new_paragraph"
  | "settings";

export type ShortcutSettings = Record<ShortcutAction, string>;

/** Portable defaults. `Mod` means Ctrl on Windows/Linux and Cmd on macOS. */
export const DEFAULT_SHORTCUTS: ShortcutSettings = {
  new_tab: "Mod+N",
  open: "Mod+O",
  save: "Mod+S",
  save_as: "Mod+Shift+S",
  close_tab: "Mod+W",
  toggle_source: "Mod+/",
  find: "Mod+F",
  replace: "Mod+H",
  new_paragraph: "Mod+Enter",
  settings: "Mod+,",
};

const MODIFIER_KEYS = new Set([
  "Control", "Shift", "Alt", "Meta", "AltGraph", "CapsLock", "NumLock", "ScrollLock",
]);
const NAMED_KEYS = new Set([
  "Enter", "Tab", "Escape", "Backspace", "Delete", "Insert", "Home", "End",
  "PageUp", "PageDown", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
  "Space", "Pause", "PrintScreen", "ContextMenu",
]);
const MODIFIER_ALIASES: Record<string, string> = {
  mod: "Mod", ctrl: "Ctrl", control: "Ctrl", meta: "Meta", cmd: "Meta",
  command: "Meta", win: "Meta", super: "Meta", alt: "Alt", option: "Alt", shift: "Shift",
};
const KEY_ALIASES: Record<string, string> = {
  esc: "Escape", spacebar: "Space", plus: "+", del: "Delete",
  left: "ArrowLeft", right: "ArrowRight", up: "ArrowUp", down: "ArrowDown",
};

function isMac(): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
}

function keyName(key: string): string | null {
  if (!key || MODIFIER_KEYS.has(key)) return null;
  if (key === " ") return "Space";
  const alias = KEY_ALIASES[key.toLowerCase()];
  if (alias) return alias;
  if (/^f(?:[1-9]|1\d|2[0-4])$/i.test(key)) return key.toUpperCase();
  const named = [...NAMED_KEYS].find((name) => name.toLowerCase() === key.toLowerCase());
  if (named) return named;
  if ([...key].length !== 1 || /\s|[\u0000-\u001f\u007f]/.test(key)) return null;
  return /[a-z]/i.test(key) ? key.toUpperCase() : key;
}

interface Shortcut {
  key: string;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
}

function parseShortcut(binding: string | undefined): Shortcut | null {
  if (typeof binding !== "string" || !binding.trim()) return null;
  const raw = binding.trim();
  // A final literal plus is a key, not an empty component: Mod+Shift++.
  const plusKey = raw === "+" || raw.endsWith("++");
  const parts = plusKey
    ? raw === "+" ? [] : raw.slice(0, -2).split("+")
    : raw.split("+");
  const key = keyName(plusKey ? "+" : parts.pop()?.trim() ?? "");
  if (!key) return null;
  const mods = new Set<string>();
  for (const part of parts) {
    const modifier = MODIFIER_ALIASES[part.trim().toLowerCase()];
    if (!modifier || mods.has(modifier)) return null;
    mods.add(modifier);
  }
  const mac = isMac();
  return {
    key,
    ctrl: mods.has("Ctrl") || (!mac && mods.has("Mod")),
    meta: mods.has("Meta") || (mac && mods.has("Mod")),
    alt: mods.has("Alt"),
    shift: mods.has("Shift"),
  };
}

function stringifyShortcut(shortcut: Shortcut): string {
  const mac = isMac();
  const parts: string[] = [];
  if (mac ? shortcut.meta : shortcut.ctrl) parts.push("Mod");
  if (mac && shortcut.ctrl) parts.push("Ctrl");
  if (!mac && shortcut.meta) parts.push("Meta");
  if (shortcut.alt) parts.push("Alt");
  if (shortcut.shift) parts.push("Shift");
  parts.push(shortcut.key);
  return parts.join("+");
}

/** Normalize aliases, modifier order and the current platform's primary modifier. */
export function canonicalizeShortcut(binding: string | undefined): string | null {
  const shortcut = parseShortcut(binding);
  return shortcut ? stringifyShortcut(shortcut) : null;
}

/** Compare the keys actually pressed, including Ctrl+K versus Mod+K on Windows. */
export function shortcutsConflict(left: string | undefined, right: string | undefined): boolean {
  const normalized = canonicalizeShortcut(left);
  return normalized !== null && normalized === canonicalizeShortcut(right);
}

function isTextInput(event: KeyboardEvent): boolean {
  return event.isComposing || event.getModifierState?.("AltGraph") === true;
}

/** Convert one physical key press into the canonical string stored in settings.toml. */
export function shortcutFromEvent(event: KeyboardEvent): string | null {
  if (isTextInput(event)) return null;
  const key = keyName(event.key);
  if (!key) return null;
  return stringifyShortcut({ key, ctrl: event.ctrlKey, meta: event.metaKey, alt: event.altKey, shift: event.shiftKey });
}

/** True when all modifiers and the key match; AltGr/IME text input never triggers an action. */
export function matchesShortcut(event: KeyboardEvent, binding: string | undefined): boolean {
  if (isTextInput(event)) return false;
  const shortcut = parseShortcut(binding);
  const key = keyName(event.key);
  return shortcut !== null && key !== null
    && event.ctrlKey === shortcut.ctrl && event.metaKey === shortcut.meta
    && event.altKey === shortcut.alt && event.shiftKey === shortcut.shift
    && key.toLowerCase() === shortcut.key.toLowerCase();
}

/** CodeMirror's current keymap plus Milkdown/native editing commands must stay usable. */
function reservedShortcuts(): Set<string> {
  const reserved = new Set<string>();
  const add = (binding: string) => {
    const normalized = canonicalizeShortcut(binding);
    if (normalized) reserved.add(normalized);
  };
  for (const binding of [...defaultKeymap, ...historyKeymap, indentWithTab]) {
    const platform = isMac() ? "mac" : /Win/i.test(navigator.platform) ? "win" : "linux";
    const key = binding[platform] ?? binding.key;
    if (!key) continue;
    const parts = key.split("-");
    const last = parts[parts.length - 1];
    // CodeMirror spells Shift+Alt+A as Alt-A.
    if (last.length === 1 && /^[A-Z]$/.test(last)) parts.unshift("Shift");
    const normalized = parts.join("+");
    add(normalized);
    if (binding.shift) add(`Shift+${normalized}`);
  }
  for (const binding of [
    "Mod+A", "Mod+C", "Mod+X", "Mod+V", "Mod+Shift+V", "Mod+Z", "Mod+Shift+Z", "Mod+Y",
    "Ctrl+Insert", "Shift+Insert", "Shift+Delete",
    "Mod+B", "Mod+I", "Mod+E", "Mod+K", "Mod+Alt+X", "Mod+Shift+B", "Mod+Alt+C",
    "Enter", "Shift+Enter", "Tab", "Shift+Tab", "Escape",
    ...(isMac() ? ["Ctrl+H", "Ctrl+D", "Alt+D", "Ctrl+Alt+Backspace"] : []),
  ]) add(binding);
  for (let level = 0; level <= 8; level++) {
    if (level <= 7) add(`Mod+${level}`);
    add(`Mod+Alt+${level}`);
  }
  // The application intentionally owns these two bindings instead of CodeMirror.
  reserved.delete(canonicalizeShortcut("Mod+/")!);
  reserved.delete(canonicalizeShortcut("Mod+Enter")!);
  return reserved;
}

/** Reject ordinary typing and bindings that would steal an existing editing command. */
export function isAssignableShortcut(binding: string | undefined): boolean {
  const shortcut = parseShortcut(binding);
  if (!shortcut) return false;
  if (!shortcut.ctrl && !shortcut.meta && !shortcut.alt && !/^F\d+$/.test(shortcut.key)) return false;
  // Option+characters on macOS is text input, just like AltGr on other keyboards.
  if (isMac() && shortcut.alt && !shortcut.ctrl && !shortcut.meta && [...shortcut.key].length === 1) return false;
  return !reservedShortcuts().has(stringifyShortcut(shortcut));
}

/** Friendly text for the settings UI. */
export function formatShortcut(binding: string | undefined): string {
  const shortcut = parseShortcut(binding);
  if (!shortcut) return "—";
  const mac = isMac();
  const parts: string[] = [];
  if (mac ? shortcut.meta : shortcut.ctrl) parts.push(mac ? "Cmd" : "Ctrl");
  if (mac && shortcut.ctrl) parts.push("Ctrl");
  if (!mac && shortcut.meta) parts.push("Meta");
  if (shortcut.alt) parts.push("Alt");
  if (shortcut.shift) parts.push("Shift");
  parts.push(shortcut.key);
  return parts.join("+");
}

/** Only supported actions survive loading; invalid/conflicting values fall back to defaults. */
export function withDefaultShortcuts(
  value: Partial<ShortcutSettings> | null | undefined,
): ShortcutSettings {
  const result = { ...DEFAULT_SHORTCUTS };
  const actions = Object.keys(DEFAULT_SHORTCUTS) as ShortcutAction[];
  for (const action of actions) {
    const raw = value?.[action];
    if (raw === "") result[action] = ""; // Hand-edited configuration can disable an action.
    else if (isAssignableShortcut(raw)) result[action] = canonicalizeShortcut(raw)!;
  }
  // Resolve together so valid swaps are accepted. A duplicate resets both actions;
  // repeat because restoring a default can expose a second conflict.
  while (true) {
    const conflicts = new Set<ShortcutAction>();
    for (let i = 0; i < actions.length; i++) {
      for (let j = i + 1; j < actions.length; j++) {
        if (shortcutsConflict(result[actions[i]], result[actions[j]])) {
          conflicts.add(actions[i]);
          conflicts.add(actions[j]);
        }
      }
    }
    if (!conflicts.size) break;
    for (const action of conflicts) result[action] = DEFAULT_SHORTCUTS[action];
  }
  return result;
}
