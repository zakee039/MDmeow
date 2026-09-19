mod assets;
mod commands;
mod export;
mod mdfmt;
mod portable;
mod proxy;
mod settings;
mod update;
mod windows_integration;

use std::path::Path;
use std::sync::{Arc, Mutex};

use tauri::{Emitter, Manager};

use settings::{LastWrite, Store};

pub struct AppState {
    pub store: Mutex<Store>,
    /// Signature of the file the app itself last wrote — lets the watcher ignore
    /// our own saves and only react to external hand edits.
    pub last_write: LastWrite,
}

/// First existing Markdown-ish file among CLI args (from "Open with" / file
/// associations). `args` includes argv[0], which is skipped.
pub fn file_arg(args: &[String]) -> Option<String> {
    args.iter().skip(1).find(|a| is_markdown_file(a)).cloned()
}

fn is_markdown_file(arg: &str) -> bool {
    let p = Path::new(arg);
    p.is_file()
        && matches!(
            p.extension()
                .and_then(|e| e.to_str())
                .map(str::to_ascii_lowercase)
                .as_deref(),
            Some("md") | Some("markdown") | Some("mdx") | Some("txt")
        )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "windows")]
    if let Some(result) = windows_integration::installer_cli_action() {
        if let Err(err) = result {
            eprintln!("MDmeow installer integration failed: {err:#}");
            std::process::exit(1);
        }
        return;
    }

    #[cfg(target_os = "windows")]
    if let Err(err) = windows_integration::maintain_portable_registration() {
        eprintln!("MDmeow portable registration maintenance failed: {err:#}");
    }

    let store = Store::locate();

    // Keep WebView2 data in the mode-specific MDmeow data directory. Must be
    // set before the webview starts.
    #[cfg(target_os = "windows")]
    {
        let data = if store.portable {
            portable::portable_dir().map(|dir| dir.join("data").join("webview2"))
        } else {
            portable::local_data_base().map(|dir| dir.join("MDmeow").join("webview2"))
        };
        if let Some(data) = data {
            if std::fs::create_dir_all(&data).is_ok() {
                std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", data);
            }
        }
    }

    let settings_path = store.path.clone();
    let last_write: LastWrite = Arc::new(Mutex::new(None));
    let watcher_last_write = last_write.clone();

    tauri::Builder::default()
        // single-instance must be registered first
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(path) = file_arg(&argv) {
                let _ = app.emit("open-file", path);
            }
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            store: Mutex::new(store),
            last_write,
        })
        .setup(move |app| {
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                settings::watch(settings_path, watcher_last_write, handle)
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::save_settings,
            commands::get_open_with_status,
            commands::register_open_with,
            commands::unregister_open_with,
            commands::read_document,
            commands::write_document,
            commands::rename_document,
            commands::render_html,
            commands::read_image_data_url,
            proxy::test_proxy,
            proxy::fetch_remote_image_data_url,
            update::check_for_update,
            update::prepare_new_version,
            update::use_prepared_version,
            update::show_prepared_version,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
