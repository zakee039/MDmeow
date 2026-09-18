//! Runtime mode and data-location helpers.
//!
//! Windows builds distinguish MSI and portable mode by the MSI install marker
//! written under HKLM. We never guess the mode from directory writability.

use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InstallMode {
    Portable,
    Msi,
}

#[cfg(target_os = "windows")]
#[derive(Debug, Clone)]
pub struct MsiInstallInfo {
    pub executable_path: PathBuf,
}

#[cfg(target_os = "windows")]
pub fn same_path(a: &Path, b: &Path) -> bool {
    let normalize = |p: &Path| {
        std::fs::canonicalize(p)
            .unwrap_or_else(|_| p.to_path_buf())
            .to_string_lossy()
            .trim_end_matches(|c| c == '\\' || c == '/')
            .replace('/', "\\")
    };
    normalize(a).eq_ignore_ascii_case(&normalize(b))
}

#[cfg(target_os = "windows")]
pub fn msi_install_info() -> Option<MsiInstallInfo> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let key = hklm.open_subkey(r"Software\MDmeow").ok()?;
    let install_type: String = key.get_value("InstallType").ok()?;
    if !install_type.eq_ignore_ascii_case("MSI") {
        return None;
    }

    let executable_path = PathBuf::from(key.get_value::<String, _>("ExecutablePath").ok()?);
    if !executable_path.is_file() {
        return None;
    }

    let install_location = PathBuf::from(key.get_value::<String, _>("InstallLocation").ok()?);
    let version: String = key.get_value("Version").ok()?;
    if install_location.as_os_str().is_empty() || version.trim().is_empty() {
        return None;
    }

    Some(MsiInstallInfo { executable_path })
}

pub fn current_mode() -> InstallMode {
    #[cfg(target_os = "windows")]
    {
        let current = match std::env::current_exe() {
            Ok(path) => path,
            Err(_) => return InstallMode::Portable,
        };
        if let Some(msi) = msi_install_info() {
            if same_path(&current, &msi.executable_path) {
                return InstallMode::Msi;
            }
        }
    }

    InstallMode::Portable
}

/// Portable base directory.
///
/// * Windows / Linux: the folder that contains the executable.
/// * macOS: the folder that contains the `.app` bundle.
pub fn portable_dir() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;

    #[cfg(target_os = "macos")]
    {
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

/// OS roaming-config directory base.
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

/// OS-local data/cache directory base.
pub fn local_data_base() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("LOCALAPPDATA").map(PathBuf::from)
    }
    #[cfg(target_os = "macos")]
    {
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Application Support"))
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/share")))
    }
}
