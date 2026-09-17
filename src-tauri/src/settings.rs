//! `settings.toml` — the single settings file, next to the executable (or in the
//! OS config dir when the program folder is read-only). Holds both app-managed
//! state (window, open tabs) and hand-editable preferences (language, fonts,
//! accent). External edits are picked up live by `watch()`.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::portable;

pub const SETTINGS_CHANGED_EVENT: &str = "settings-changed";

/// (size, mtime-millis) — a cheap change signature for `settings.toml`.
pub type Signature = (u64, u128);
pub type LastWrite = Arc<Mutex<Option<Signature>>>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct WindowState {
    pub width: f64,
    pub height: f64,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub maximized: bool,
}

impl Default for WindowState {
    fn default() -> Self {
        Self {
            width: 900.0,
            height: 680.0,
            x: None,
            y: None,
            maximized: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ShortcutSettings {
    pub new_tab: String,
    pub open: String,
    pub save: String,
    pub save_as: String,
    pub close_tab: String,
    pub export: String,
    pub toggle_source: String,
    pub find: String,
    pub replace: String,
    pub emoji: String,
    pub settings: String,
}

impl Default for ShortcutSettings {
    fn default() -> Self {
        Self {
            new_tab: "Mod+N".to_string(),
            open: "Mod+O".to_string(),
            save: "Mod+S".to_string(),
            save_as: "Mod+Shift+S".to_string(),
            close_tab: "Mod+W".to_string(),
            export: "Mod+E".to_string(),
            toggle_source: "Mod+/".to_string(),
            find: "Mod+F".to_string(),
            replace: "Mod+H".to_string(),
            emoji: "Mod+.".to_string(),
            settings: "Mod+,".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    // --- hand-editable preferences ---
    /// UI language: "system" (OS locale) | "en" | "de" | "zh-CN"
    pub language: String,
    /// "ltr" | "rtl" — base writing direction of the editor.
    pub direction: String,
    pub spellcheck: bool,
    /// When true, pressing Esc quits the app.
    pub quit_on_escape: bool,
    /// Bullet-list marker written on save: "*", "-" or "+".
    pub list_marker: String,
    /// Show the full file path (not just the file name) in the editor header.
    pub show_path: bool,
    /// Reopen the previous session's tabs on startup.
    pub open_last_session: bool,
    /// Keep the tab bar visible even when only one file is open.
    pub always_show_tabbar: bool,
    /// WYSIWYG editor font family ("" = built-in default).
    pub editor_font: String,
    /// Base editor font size in px (headings scale from this).
    pub editor_font_size: u16,
    /// Markdown source-view font family ("" = built-in monospace).
    pub source_font: String,
    pub source_font_size: u16,
    /// Accent colour ("" = default), e.g. "#0969da".
    pub accent: String,
    /// User-configurable application shortcuts.
    pub shortcuts: ShortcutSettings,

    // --- app-managed state ---
    /// Suppress the startup prompt asking to register Mowl in Windows Open With.
    pub open_with_prompt_dismissed: bool,
    /// Files to reopen on next launch (session restore).
    pub open_files: Vec<PathBuf>,
    /// Writing direction ("ltr"|"rtl") per entry in `open_files`, so a restored
    /// tab keeps the orientation it had. Shorter/longer than `open_files` is fine.
    pub open_dirs: Vec<String>,
    /// Index into `open_files` of the tab that was active.
    pub active_tab: usize,
    pub window: WindowState,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            language: "system".to_string(),
            direction: "ltr".to_string(),
            spellcheck: true,
            quit_on_escape: false,
            list_marker: "*".to_string(),
            show_path: false,
            open_last_session: true,
            always_show_tabbar: false,
            editor_font: String::new(),
            editor_font_size: 16,
            source_font: String::new(),
            source_font_size: 15,
            accent: String::new(),
            shortcuts: ShortcutSettings::default(),
            open_with_prompt_dismissed: false,
            open_files: Vec::new(),
            open_dirs: Vec::new(),
            active_tab: 0,
            window: WindowState::default(),
        }
    }
}

/// Where settings live and whether that location is the portable program folder.
#[derive(Debug, Clone)]
pub struct Store {
    pub path: PathBuf,
    pub portable: bool,
}

impl Store {
    /// Decide the settings location once at startup.
    pub fn locate() -> Self {
        if let Some(dir) = portable::portable_dir() {
            if portable::is_writable(&dir) {
                return Self {
                    path: dir.join("settings.toml"),
                    portable: true,
                };
            }
        }

        let base = portable::config_base().unwrap_or_else(std::env::temp_dir);
        let dir = base.join("Mowl");
        let _ = std::fs::create_dir_all(&dir);
        Self {
            path: dir.join("settings.toml"),
            portable: false,
        }
    }

    pub fn load(&self) -> Settings {
        std::fs::read_to_string(&self.path)
            .ok()
            .and_then(|raw| toml::from_str(&raw).ok())
            .unwrap_or_default()
    }

    /// Write settings; returns the signature of the file just written.
    pub fn save(&self, settings: &Settings) -> anyhow::Result<Signature> {
        let body = toml::to_string_pretty(settings)?;
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&self.path, body)?;
        Ok(signature(&self.path).unwrap_or((0, 0)))
    }
}

fn signature(path: &Path) -> Option<Signature> {
    let meta = std::fs::metadata(path).ok()?;
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis())
        .unwrap_or(0);
    Some((meta.len(), mtime))
}

/// Poll `settings.toml` once a second; when it changes on disk from something
/// other than our own last write (i.e. a hand edit), reload and emit
/// `settings-changed` so the UI can update without a restart.
pub fn watch(path: PathBuf, last_write: LastWrite, app: AppHandle) {
    let mut seen = signature(&path);
    loop {
        std::thread::sleep(Duration::from_millis(1000));
        let now = signature(&path);
        if now == seen {
            continue;
        }
        seen = now;
        if now.is_some() && *last_write.lock().unwrap() == now {
            continue; // this was our own save
        }
        if let Ok(raw) = std::fs::read_to_string(&path) {
            if let Ok(settings) = toml::from_str::<Settings>(&raw) {
                let _ = app.emit(SETTINGS_CHANGED_EVENT, settings);
            }
        }
    }
}
