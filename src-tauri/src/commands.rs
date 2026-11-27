//! Tauri commands exposed to the frontend.

use serde::Serialize;
use tauri::State;
use tauri_plugin_opener::OpenerExt;

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

fn read_document_sync(path: &str) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("Cannot read {path}: {e}"))?;
    let sample = &bytes[..bytes.len().min(8192)];
    if looks_like_binary(sample) {
        return Err(format!("Cannot open {path}: the file appears to be binary."));
    }
    String::from_utf8(bytes)
        .map_err(|_| format!("Cannot open {path}: the file is not valid UTF-8 text."))
}

#[tauri::command]
pub async fn read_document(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || read_document_sync(&path))
        .await
        .map_err(|e| format!("Failed to read document: {e}"))?
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

    #[test]
    fn editing_regular_text_preserves_unsupported_markdown_when_saved() {
        // Only unique temporary fixtures are written. Never touch user documents.
        let base = std::env::temp_dir().join(format!(
            "mdmeow_integrity_regression_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock before epoch")
                .as_nanos()
        ));
        std::fs::create_dir_all(&base).expect("create isolated fixtures");
        let cases = [
            ("frontmatter", "---\ntitle: KEEP_META_UNTOUCHED\n---\n\nNORMAL_BEFORE\n"),
            ("orphan_ref", "# Heading\n\n[unused]: https://example.test/KEEP_ORPHAN_UNTOUCHED\n\nNORMAL_BEFORE\n"),
            ("crlf", "---\r\ntitle: KEEP_CRLF_UNTOUCHED\r\n---\r\n\r\nNORMAL_BEFORE\r\n"),
            ("mixed_eol", "---\r\ntitle: KEEP_MIXED_UNTOUCHED\n---\r\n\nNORMAL_BEFORE\r\n"),
            ("old_mac", "[unused]: https://example.test/KEEP_CR_UNTOUCHED\rNORMAL_BEFORE\r"),
        ];
        for (name, original) in cases {
            let path = base.join(format!("{name}.md"));
            let path_str = path.to_string_lossy().to_string();
            std::fs::write(&path, original).expect("write isolated fixture");
            let read = super::read_document_sync(&path_str).expect("read fixture");
            assert_eq!(read, original, "read changed the original {name}");
            let edited = read.replace("NORMAL_BEFORE", "NORMAL_AFTER_USER_EDIT");
            let written = super::write_document(path_str.clone(), edited.clone(), Some(true))
                .expect("save isolated fixture in source mode");
            assert_eq!(written, edited, "formatter altered source text for {name}");
            let reopened = super::read_document_sync(&path_str).expect("reopen fixture");
            assert_eq!(reopened, edited, "original unsupported region lost for {name}");
        }
    }
}

/// Write `contents` to `path`, pretty-printing any GFM tables first.
/// Returns the text that was actually written so the UI can resync.
#[tauri::command]
pub fn write_document(path: String, contents: String, preserve_source: Option<bool>) -> Result<String, String> {
    let is_markdown = matches!(
        std::path::Path::new(&path)
            .extension()
            .and_then(|e| e.to_str()),
        Some("md") | Some("markdown") | Some("mdx") | None
    );
    let formatted = if is_markdown && !preserve_source.unwrap_or(false) {
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
pub fn render_html(markdown: String, title: String, doc_path: Option<String>, for_print: Option<bool>) -> String {
    export::render_html(&markdown, &title, doc_path.as_deref(), for_print.unwrap_or(false))
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

#[derive(Serialize)]
pub struct ResolvedDocumentLink {
    pub path: String,
    pub fragment: Option<String>,
    pub exists: bool,
    pub is_markdown: bool,
    pub can_open_externally: bool,
}

fn clean_display_path(path: &std::path::Path) -> String {
    let s = path.display().to_string();
    #[cfg(target_os = "windows")]
    {
        if let Some(unc) = s.strip_prefix(r"\\?\UNC\") {
            return format!(r"\\{unc}");
        }
        if let Some(rest) = s.strip_prefix(r"\\?\") {
            return rest.to_string();
        }
    }
    s
}

fn is_safe_external_link_ext(ext: Option<&str>) -> bool {
    matches!(
        ext.map(str::to_ascii_lowercase).as_deref(),
        Some(
            "html"
                | "htm"
                | "xhtml"
                | "pdf"
                | "svg"
                | "png"
                | "jpg"
                | "jpeg"
                | "gif"
                | "webp"
                | "bmp"
                | "ico"
                | "avif"
                | "txt"
                | "log"
                | "csv"
                | "tsv"
                | "json"
                | "xml"
                | "yaml"
                | "yml"
                | "toml"
                | "ini"
                | "css"
                | "mp3"
                | "wav"
                | "ogg"
                | "mp4"
                | "webm"
                | "mov"
                | "docx"
                | "xlsx"
                | "pptx"
                | "rtf"
                | "epub"
        )
    )
}

fn resolve_document_link_impl(
    doc_path: Option<&str>,
    href: &str,
) -> Result<ResolvedDocumentLink, String> {
    let trimmed = href.trim();
    if trimmed.is_empty() {
        return Err("Empty link target.".to_string());
    }
    let (raw_path_part, fragment) = match trimmed.find('#') {
        Some(idx) => {
            let frag = trimmed[idx..].trim();
            (
                trimmed[..idx].trim(),
                if frag.len() > 1 {
                    Some(frag.to_string())
                } else {
                    None
                },
            )
        }
        None => (trimmed, None),
    };
    let path_without_query = raw_path_part.split('?').next().unwrap_or(raw_path_part);
    let decoded = assets::percent_decode(path_without_query.trim());
    if decoded.is_empty() {
        return Err("Empty file path.".to_string());
    }

    let candidate = std::path::PathBuf::from(&decoded);
    let joined = if candidate.is_absolute() {
        candidate
    } else {
        let base = doc_path
            .map(std::path::Path::new)
            .and_then(std::path::Path::parent)
            .ok_or_else(|| "Save the current document first to open relative links.".to_string())?;
        base.join(candidate)
    };

    let exists = joined.is_file();
    let final_path = if exists {
        std::fs::canonicalize(&joined).unwrap_or(joined)
    } else {
        joined
    };
    let ext = final_path.extension().and_then(|e| e.to_str());
    let is_markdown = matches!(
        ext.map(str::to_ascii_lowercase).as_deref(),
        Some("md" | "markdown" | "mdx")
    );
    let can_open_externally = is_safe_external_link_ext(ext);

    Ok(ResolvedDocumentLink {
        path: clean_display_path(&final_path),
        fragment,
        exists,
        is_markdown,
        can_open_externally,
    })
}

/// Resolve a relative or local file link against the active document's folder.
#[tauri::command]
pub fn resolve_document_link(
    doc_path: Option<String>,
    href: String,
) -> Result<ResolvedDocumentLink, String> {
    resolve_document_link_impl(doc_path.as_deref(), &href)
}

/// Open a safe non-executable local file referenced from Markdown (e.g. `.html`,
/// `.pdf`, images) with the system's default application.
#[tauri::command]
pub fn open_local_document_link(
    app: tauri::AppHandle,
    doc_path: Option<String>,
    href: String,
) -> Result<(), String> {
    let resolved = resolve_document_link_impl(doc_path.as_deref(), &href)?;
    if !resolved.exists {
        return Err(format!("Linked file does not exist: {}", resolved.path));
    }
    if !resolved.can_open_externally {
        return Err(format!(
            "Opening this file type directly is blocked for safety: {}",
            resolved.path
        ));
    }
    app.opener()
        .open_path(&resolved.path, None::<&str>)
        .map_err(|e| format!("Cannot open {}: {e}", resolved.path))
}

#[cfg(test)]
mod link_tests {
    use super::resolve_document_link_impl;

    #[test]
    fn resolves_relative_markdown_and_html_and_blocks_executables() {
        let base = std::env::temp_dir().join(format!(
            "mdmeow_link_test_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&base).unwrap();
        let doc = base.join("index.md");
        let note = base.join("note 1.md");
        let html = base.join("demo.html");
        let bat = base.join("danger.bat");
        std::fs::write(&doc, "# hi").unwrap();
        std::fs::write(&note, "# note").unwrap();
        std::fs::write(&html, "<p>ok</p>").unwrap();
        std::fs::write(&bat, "echo hi").unwrap();

        let md_link =
            resolve_document_link_impl(doc.to_str(), "./note%201.md#section-2").unwrap();
        assert!(md_link.exists);
        assert!(md_link.is_markdown);
        assert_eq!(md_link.fragment.as_deref(), Some("#section-2"));

        let html_link = resolve_document_link_impl(doc.to_str(), "./demo.html").unwrap();
        assert!(html_link.exists);
        assert!(!html_link.is_markdown);
        assert!(html_link.can_open_externally);

        let bat_link = resolve_document_link_impl(doc.to_str(), "./danger.bat").unwrap();
        assert!(bat_link.exists);
        assert!(!bat_link.is_markdown);
        assert!(!bat_link.can_open_externally);

        let _ = std::fs::remove_dir_all(&base);
    }
}
