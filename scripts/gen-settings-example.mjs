// Emits `settings.example.toml` next to the built executable on every build.
// Wired into `build.beforeBuildCommand` in src-tauri/tauri.conf.json, so it runs
// for both `tauri dev` and `tauri build`. Never fails the build — worst case it
// logs a warning and exits 0.

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const CONTENT = `# MDmeow — example configuration
#
# Copy this file to "settings.toml" in the same folder and edit it. MDmeow also
# creates and maintains settings.toml on its own; hand edits are picked up within
# about a second, no restart needed. Every key is optional and falls back to the
# default shown here.

# --- appearance & behaviour (safe to hand-edit) ---
# All of these can also be changed from the in-app settings screen (the settings
# button in the toolbar, or Ctrl/Cmd+,).

language = "system"         # "system" (follow the OS) | "en" | "de" | "zh-CN"
spellcheck = true           # spell-check squiggles in the WYSIWYG editor
quit_on_escape = false      # when true, pressing Esc quits the app
list_marker = "*"           # bullet-list marker written on save: "*" | "-" | "+"
show_path = false           # show the full file path in the header, not just the name
open_last_session = true    # reopen the previous session's tabs on startup
always_show_tabbar = false  # keep the tab bar visible even with only one file open

editor_font = ""            # WYSIWYG font family ("" = built-in default)
editor_font_size = 16       # base editor size in px (headings scale from this)
source_font = ""            # Markdown source-view font ("" = built-in monospace)
source_font_size = 15       # source-view size in px
accent = "#39C5BB"         # accent colour; reset/default is Miku teal

# App shortcuts. "Mod" means Ctrl on Windows/Linux and Cmd on macOS.
[shortcuts]
new_tab = "Mod+N"
open = "Mod+O"
save = "Mod+S"
save_as = "Mod+Shift+S"
close_tab = "Mod+W"
export = "Mod+E"
toggle_source = "Mod+/"
find = "Mod+F"
replace = "Mod+H"
emoji = "Mod+."
settings = "Mod+,"

# --- written and managed by MDmeow — no need to touch these ---
# open_with_prompt_dismissed = false  # do not ask again after declining Open with registration
# open_files = []            # files to reopen on next launch (session restore)
# active_tab = 0             # index into open_files of the active tab
# [window]                   # width / height / x / y / maximized
`;

let wrote = 0;
for (const profile of ["release", "debug"]) {
  const dir = join(root, "src-tauri", "target", profile);
  // Only seed a profile dir that exists, but always ensure `release` (a clean
  // `tauri build` creates it right after this hook runs).
  if (!existsSync(dir) && profile !== "release") continue;
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "settings.example.toml"), CONTENT);
    wrote++;
  } catch (err) {
    console.warn(`[settings-example] skipped ${profile}: ${err.message}`);
  }
}
console.log(`[settings-example] wrote settings.example.toml (${wrote} location(s))`);
