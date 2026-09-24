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
pub fn register_file_associations(extensions: Vec<String>) -> Result<OpenWithStatus, String> {
    windows_integration::register_file_associations(extensions).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn unregister_open_with() -> Result<OpenWithStatus, String> {
    windows_integration::unregister_open_with().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_document(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("Cannot read {path}: {e}"))?;
    let sample = &bytes[..bytes.len().min(8192)];
    if looks_like_binary(sample) {
        return Err(format!("Cannot open {path}: the file appears to be binary."));
    }
    String::from_utf8(bytes)
        .map_err(|_| format!("Cannot open {path}: the file is not valid UTF-8 text."))
}

fn looks_like_binary(sample: &[u8]) -> bool {
    let suspicious_controls = sample
        .iter()
        .filter(|&&b| b < 0x20 && !matches!(b, b'\t' | b'\n' | b'\r' | 0x0C))
        .count();
    sample.contains(&0) || (!sample.is_empty() && suspicious_controls * 50 > sample.len())
}

#[cfg(test)]
mod document_tests {
    use super::looks_like_binary;

    #[test]
    fn ordinary_utf8_text_is_not_binary() {
        assert!(!looks_like_binary("hello\n世界\t42".as_bytes()));
    }

    #[test]
    fn nul_bytes_are_binary() {
        assert!(looks_like_binary(b"hello\0world"));
    }

    #[test]
    fn dense_control_bytes_are_binary() {
        assert!(looks_like_binary(&[1, 2, 3, 4, b'a', b'b', b'c']));
    }
}

/// Write `contents` to `path`, pretty-printing any GFM tables first.
/// Returns the text that was actually written so the UI can resync.
#[tauri::command]
pub fn write_document(path: String, contents: String) -> Result<String, String> {
    let is_markdown = matches!(
        std::path::Path::new(&path)
            .extension()
            .and_then(|e| e.to_str()),
        Some("md") | Some("markdown") | Some("mdx") | None
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
