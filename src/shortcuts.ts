export type ShortcutAction =
  | "new_tab"
  | "open"
  | "save"
  | "save_as"
  | "close_tab"
  | "export"
  | "toggle_source"
  | "find"
  | "replace"
  | "emoji"
  | "settings";

export type ShortcutSettings = Record<ShortcutAction, string>;

/** Portable defaults. `Mod` means Ctrl on Windows/Linux and Cmd on macOS. */
export const DEFAULT_SHORTCUTS: ShortcutSettings = {
  new_tab: "Mod+N",
  open: "Mod+O",
  save: "Mod+S",
  save_as: "Mod+Shift+S",
  close_tab: "Mod+W",
  export: "Mod+E",
  toggle_source: "Mod+/",
  find: "Mod+F",
  replace: "Mod+H",
  emoji: "Mod+.",
  settings: "Mod+,",
};

const MODIFIER_KEYS = new Set([
  "Control",
  "Shift",
  "Alt",
  "Meta",
  "AltGraph",
  "CapsLock",
  "NumLock",
  "ScrollLock",
]);

function isMac(): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
}

function keyName(key: string): string | null {
  if (!key || key === "Unidentified" || key === "Process" || key === "Dead") return null;
  if (MODIFIER_KEYS.has(key)) return null;
  if (key === " ") return "Space";
  if (key.length === 1 && /[a-z]/i.test(key)) return key.toUpperCase();
  if (/^f\d{1,2}$/i.test(key)) return key.toUpperCase();
  return key;
}

/** Convert one physical key press into the canonical string stored in settings.toml. */
export function shortcutFromEvent(event: KeyboardEvent): string | null {
  const key = keyName(event.key);
  if (!key) return null;

  const parts: string[] = [];
  const mac = isMac();
  const primary = mac ? event.metaKey : event.ctrlKey;
  if (primary) parts.push("Mod");
  if (event.ctrlKey && (mac || !primary)) parts.push("Ctrl");
  if (event.metaKey && (!mac || !primary)) parts.push("Meta");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}

function normalizedEventKey(key: string): string {
  return keyName(key) ?? key;
}

/** True when a KeyboardEvent matches a canonical shortcut string. */
export function matchesShortcut(event: KeyboardEvent, binding: string | undefined): boolean {
  if (!binding) return false;
  const parts = binding.split("+").filter(Boolean);
  if (!parts.length) return false;
  const key = parts[parts.length - 1];
  const mods = new Set(parts.slice(0, -1));
  const mac = isMac();

  if (mods.has("Mod")) {
    if (!(event.ctrlKey || event.metaKey)) return false;
  } else {
    if (event.ctrlKey !== mods.has("Ctrl")) return false;
    if (event.metaKey !== mods.has("Meta")) return false;
  }
  if (mods.has("Mod")) {
    // An explicit secondary primary modifier is still respected.
    if (mods.has("Ctrl") && !event.ctrlKey) return false;
    if (mods.has("Meta") && !event.metaKey) return false;
    if (!mods.has("Ctrl") && !mods.has("Meta")) {
      const expectedPrimary = mac ? event.metaKey : event.ctrlKey;
      if (!expectedPrimary) return false;
      const unexpectedOther = mac ? event.ctrlKey : event.metaKey;
      if (unexpectedOther) return false;
    }
  }
  if (event.altKey !== mods.has("Alt")) return false;
  if (event.shiftKey !== mods.has("Shift")) return false;
  return normalizedEventKey(event.key).toLowerCase() === key.toLowerCase();
}

/** Friendly text for the settings UI. */
export function formatShortcut(binding: string | undefined): string {
  if (!binding) return "—";
  const mac = isMac();
  return binding
    .split("+")
    .map((part) => {
      if (part === "Mod") return mac ? "Cmd" : "Ctrl";
      if (part === "Meta") return mac ? "Cmd" : "Meta";
      return part;
    })
    .join("+");
}

export function withDefaultShortcuts(
  value: Partial<ShortcutSettings> | null | undefined,
): ShortcutSettings {
  return { ...DEFAULT_SHORTCUTS, ...(value ?? {}) };
}
