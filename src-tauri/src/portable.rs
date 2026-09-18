//! Resolves the directory used for portable data (settings + webview cache).
//!
//! * Windows / Linux: the folder that contains the executable.
//! * macOS: the folder that contains the `.app` bundle. Writing *inside* the
//!   bundle breaks the code signature, so we climb out to its parent.

use std::fs;
use std::path::{Path, PathBuf};

/// Best guess for the portable base directory. `None` if the executable path
/// cannot be determined.
pub fn portable_dir() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;

    #[cfg(target_os = "macos")]
    {
        // .../MDmeow.app/Contents/MacOS/mdmeow  ->  .../
        let comps: Vec<_> = exe.components().collect();
        if let Some(idx) = comps
            .iter()
            .position(|c| c.as_os_str().to_string_lossy().ends_with(".app"))
        {
            let mut base = PathBuf::new();
            for c in &comps[..idx] {
                base.push(c.as_os_str());
            }
            return Some(base);
        }
    }

    Some(exe.parent()?.to_path_buf())
}

/// Returns `true` if a file can be created in `dir`.
pub fn is_writable(dir: &Path) -> bool {
    if !dir.is_dir() {
        return false;
    }
    let probe = dir.join(".mdmeow-write-test");
    match fs::File::create(&probe) {
        Ok(_) => {
            let _ = fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

/// OS config directory base (no external crate needed).
pub fn config_base() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("APPDATA").map(PathBuf::from)
    }
    #[cfg(target_os = "macos")]
    {
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Application Support"))
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))
    }
}
