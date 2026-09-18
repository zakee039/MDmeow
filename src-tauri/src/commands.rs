//! Tauri commands exposed to the frontend.

use serde::Serialize;
use tauri::State;

use crate::settings::Settings;
use crate::windows_integration::OpenWithStatus;
use crate::{assets, export, file_arg, mdfmt, windows_integration, AppState};

#[derive(Serialize)]
pub struct SettingsPayload {
    pub settings: Settings,
    /// `true` when settings live next to the executable (portable install).
    pub portable: bool,
    /// `true` only when a portable build had to fall back to user config
    /// because its executable directory was not writable.
    pub fallback: bool,
    /// Absolute path of the settings file, shown in the UI hint / About panel.
    pub location: String,
    /// A file passed on the command line ("Open with" / double-click), if any.
    pub open_with: Option<String>,
    /// App version (`CARGO_PKG_VERSION`), for the About panel.
    pub version: String,
}

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> SettingsPayload {
    let store = state.store.lock().unwrap();
    SettingsPayload {
        settings: store.load(),
        portable: store.portable,
        fallback: store.fallback,
        location: store.path.display().to_string(),
        open_with: file_arg(&std::env::args().collect::<Vec<_>>()),
        version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

#[tauri::command]
pub fn save_settings(state: State<AppState>, settings: Settings) -> Result<(), String> {
    let sig = state
        .store
        .lock()
        .unwrap()
        .save(&settings)
        .map_err(|e| e.to_string())?;
    *state.last_write.lock().unwrap() = Some(sig);
    Ok(())
}

#[tauri::command]
pub fn get_open_with_status() -> OpenWithStatus {
    windows_integration::open_with_status()
}

#[tauri::command]
pub fn register_open_with() -> Result<OpenWithStatus, String> {
    windows_integration::register_open_with().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn unregister_open_with() -> Result<OpenWithStatus, String> {
    windows_integration::unregister_open_with().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_document(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Cannot read {path}: {e}"))
}

/// Write `contents` to `path`, pretty-printing any GFM tables first.
/// Returns the text that was actually written so the UI can resync.
#[tauri::command]
pub fn write_document(path: String, contents: String) -> Result<String, String> {
    let is_markdown = matches!(
        std::path::Path::new(&path)
            .extension()
            .and_then(|e| e.to_str()),
        Some("md") | Some("markdown") | Some("mdx") | Some("txt") | None
    );
    let formatted = if is_markdown {
        mdfmt::format_tables(&contents)
    } else {
        contents
    };
    std::fs::write(&path, &formatted).map_err(|e| format!("Cannot write {path}: {e}"))?;
    Ok(formatted)
}

/// Rename an existing document within its current directory.
///
/// The frontend exposes this as inline filename editing in the title bar, so
/// this command deliberately accepts a file name only (not a destination path)
/// and cannot be used to move a document to another directory.
#[tauri::command]
pub fn rename_document(path: String, new_name: String) -> Result<String, String> {
    let source = std::path::PathBuf::from(&path);
    if !source.is_file() {
        return Err(format!("File does not exist: {path}"));
    }

    let name = new_name.trim();
    if name.is_empty() || name == "." || name == ".." {
        return Err("File name cannot be empty.".to_string());
    }
    let candidate = std::path::Path::new(name);
    if candidate.components().count() != 1 || candidate.file_name().and_then(|v| v.to_str()) != Some(name) {
        return Err("Enter a file name only, without folders.".to_string());
    }

    let parent = source
        .parent()
        .ok_or_else(|| "The current file has no parent directory.".to_string())?;
    let destination = parent.join(name);
    if destination == source {
        return Ok(source.display().to_string());
    }
    if destination.exists() {
        return Err(format!("A file named '{name}' already exists."));
    }

    std::fs::rename(&source, &destination)
        .map_err(|e| format!("Cannot rename {} to {}: {e}", source.display(), destination.display()))?;
    Ok(destination.display().to_string())
}

/// Render Markdown to a complete, self-contained HTML document. `doc_path` (the
/// file being exported) is the base for resolving relative image paths, which
/// are inlined as `data:` URLs so the HTML / print output is self-contained.
#[tauri::command]
pub fn render_html(markdown: String, title: String, doc_path: Option<String>) -> String {
    export::render_html(&markdown, &title, doc_path.as_deref())
}

/// Read a local image referenced by a document and return it as a `data:` URL.
///
/// The editor's WebView cannot load images by relative or absolute filesystem
/// path, so `proxyDomURL` in the frontend routes those here. Remote (`http(s):`),
/// `data:` and `blob:` targets never reach this command.
#[tauri::command]
pub fn read_image_data_url(doc_path: Option<String>, src: String) -> Result<String, String> {
    assets::to_data_url(doc_path.as_deref(), &src)
}
