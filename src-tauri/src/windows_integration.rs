use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct OpenWithStatus {
    pub available: bool,
    pub registered: bool,
    pub managed_by_msi: bool,
    pub can_modify: bool,
    pub registered_extensions: Vec<String>,
}

#[cfg(target_os = "windows")]
const PROG_ID: &str = "MDmeow.Markdown";
const LEGACY_APP_EXE: &str = "mowl.exe";
#[cfg(target_os = "windows")]
const LEGACY_PROG_IDS: [&str; 3] = ["Mowl.Markdown", "MDmeow.md", "MDmeow.markdown"];
#[cfg(target_os = "windows")]
const EXTENSIONS: [&str; 3] = [".md", ".markdown", ".mdx"];
#[cfg(target_os = "windows")]
const SUPPORTED_EXTENSIONS: [&str; 46] = [
    ".md", ".markdown", ".mdx",
    ".json", ".yaml", ".yml", ".xml", ".toml", ".ini", ".conf", ".env", ".jsonl", ".csv",
    ".html", ".htm", ".css", ".scss", ".less", ".js", ".mjs", ".cjs", ".ts", ".jsx", ".tsx", ".vue",
    ".py", ".rs", ".c", ".cpp", ".cc", ".h", ".hpp", ".java", ".go", ".php", ".sql", ".sh", ".bash", ".ps1", ".rb", ".swift", ".kt", ".kts", ".cs",
    ".txt", ".log",
];

#[cfg(target_os = "windows")]
fn current_exe_and_name() -> anyhow::Result<(std::path::PathBuf, String)> {
    let exe = std::env::current_exe()?;
    let name = exe
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| anyhow::anyhow!("current executable has no file name"))?
        .to_string();
    Ok((exe, name))
}

#[cfg(target_os = "windows")]
fn expected_command(exe: &std::path::Path) -> String {
    format!("\"{}\" \"%1\"", exe.display())
}

#[cfg(target_os = "windows")]
fn read_string(key: &winreg::RegKey, path: &str, name: &str) -> Option<String> {
    key.open_subkey(path).ok()?.get_value(name).ok()
}

#[cfg(target_os = "windows")]
fn command_matches(actual: Option<String>, exe: &std::path::Path) -> bool {
    actual
        .as_deref()
        .map(|v| v.trim().eq_ignore_ascii_case(&expected_command(exe)))
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn is_versioned_portable_app(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.starts_with("mdmeow-") && lower.ends_with(".exe")
}

#[cfg(target_os = "windows")]
fn prog_id_points_to(exe: &std::path::Path) -> bool {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let path = format!(r"Software\Classes\{PROG_ID}\shell\open\command");
    command_matches(read_string(&hkcu, &path, ""), exe)
}

#[cfg(target_os = "windows")]
fn command_executable(command: &str) -> Option<std::path::PathBuf> {
    let raw = command.trim();
    if let Some(rest) = raw.strip_prefix('"') {
        let end = rest.find('"')?;
        return Some(std::path::PathBuf::from(&rest[..end]));
    }
    raw.split_whitespace().next().map(std::path::PathBuf::from)
}

#[cfg(target_os = "windows")]
fn prog_id_owned_by_versioned_portable() -> bool {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let path = format!(r"Software\Classes\{PROG_ID}\shell\open\command");
    let Some(command) = read_string(&hkcu, &path, "") else {
        return false;
    };
    command_executable(&command)
        .and_then(|p| p.file_name().and_then(|n| n.to_str()).map(str::to_string))
        .map(|name| is_versioned_portable_app(&name))
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn valid_msi_registration() -> Option<crate::portable::MsiInstallInfo> {
    // MSI ownership is determined by the install marker and executable itself,
    // not by the current set of user-selected file associations. This keeps
    // installed MDmeow authoritative even when the user deliberately registers
    // only a subset of extensions.
    crate::portable::msi_install_info()
}

#[cfg(target_os = "windows")]
fn cleanup_legacy(hkcu: &winreg::RegKey) -> anyhow::Result<()> {
    use std::io::ErrorKind;
    use winreg::enums::KEY_WRITE;

    for prog_id in LEGACY_PROG_IDS {
        let path = format!(r"Software\Classes\{prog_id}");
        if let Err(err) = hkcu.delete_subkey_all(path) {
            if err.kind() != ErrorKind::NotFound {
                return Err(err.into());
            }
        }
    }

    let legacy_app = format!(r"Software\Classes\Applications\{LEGACY_APP_EXE}");
    if let Err(err) = hkcu.delete_subkey_all(legacy_app) {
        if err.kind() != ErrorKind::NotFound {
            return Err(err.into());
        }
    }

    for ext in EXTENSIONS {
        if let Ok(key) = hkcu.open_subkey_with_flags(
            format!(r"Software\Classes\{ext}\OpenWithProgids"),
            KEY_WRITE,
        ) {
            for prog_id in LEGACY_PROG_IDS {
                let _ = key.delete_value(prog_id);
            }
        }
        if let Ok(key) = hkcu.open_subkey_with_flags(
            format!(r"Software\Classes\{ext}\OpenWithList"),
            KEY_WRITE,
        ) {
            let _ = key.delete_value(LEGACY_APP_EXE);
        }
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn cleanup_old_portable_entries(
    hkcu: &winreg::RegKey,
    keep_app_exe: Option<&str>,
) -> anyhow::Result<()> {
    use winreg::enums::{KEY_READ, KEY_WRITE};

    if let Ok(apps) =
        hkcu.open_subkey_with_flags(r"Software\Classes\Applications", KEY_READ | KEY_WRITE)
    {
        let names: Vec<String> = apps.enum_keys().filter_map(Result::ok).collect();
        for name in names {
            if is_versioned_portable_app(&name)
                && !keep_app_exe
                    .map(|keep| keep.eq_ignore_ascii_case(&name))
                    .unwrap_or(false)
            {
                let _ = apps.delete_subkey_all(&name);
            }
        }
    }

    for ext in SUPPORTED_EXTENSIONS {
        if let Ok(key) = hkcu.open_subkey_with_flags(
            format!(r"Software\Classes\{ext}\OpenWithList"),
            KEY_READ | KEY_WRITE,
        ) {
            let names: Vec<String> = key
                .enum_values()
                .filter_map(Result::ok)
                .map(|(name, _)| name)
                .collect();
            for name in names {
                if is_versioned_portable_app(&name)
                    && !keep_app_exe
                        .map(|keep| keep.eq_ignore_ascii_case(&name))
                        .unwrap_or(false)
                {
                    let _ = key.delete_value(name);
                }
            }
        }
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn normalized_extensions(extensions: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    for raw in extensions {
        let lower = raw.trim().to_ascii_lowercase();
        let normalized = if lower.starts_with('.') {
            lower
        } else {
            format!(".{lower}")
        };
        if SUPPORTED_EXTENSIONS.contains(&normalized.as_str()) && !out.contains(&normalized) {
            out.push(normalized);
        }
    }
    out
}

#[cfg(target_os = "windows")]
fn clear_extension_values(hkcu: &winreg::RegKey, app_exe: &str) {
    use winreg::enums::KEY_WRITE;

    if let Ok(supported) = hkcu.open_subkey_with_flags(
        format!(r"Software\Classes\Applications\{app_exe}\SupportedTypes"),
        KEY_WRITE,
    ) {
        for ext in SUPPORTED_EXTENSIONS {
            let _ = supported.delete_value(ext);
        }
    }
    if let Ok(file_assoc) = hkcu.open_subkey_with_flags(
        r"Software\MDmeow\Capabilities\FileAssociations",
        KEY_WRITE,
    ) {
        for ext in SUPPORTED_EXTENSIONS {
            let _ = file_assoc.delete_value(ext);
        }
    }
    for ext in SUPPORTED_EXTENSIONS {
        if let Ok(key) = hkcu.open_subkey_with_flags(
            format!(r"Software\Classes\{ext}\OpenWithProgids"),
            KEY_WRITE,
        ) {
            let _ = key.delete_value(PROG_ID);
        }
        if let Ok(key) = hkcu.open_subkey_with_flags(
            format!(r"Software\Classes\{ext}\OpenWithList"),
            KEY_WRITE,
        ) {
            let _ = key.delete_value(app_exe);
        }
    }
}

#[cfg(target_os = "windows")]
fn write_registration_for_extensions(
    hkcu: &winreg::RegKey,
    exe: &std::path::Path,
    app_exe: &str,
    extensions: &[String],
) -> anyhow::Result<()> {
    let command = expected_command(exe);
    let icon = format!("\"{}\",0", exe.display());
    let extensions = normalized_extensions(extensions);

    let (prog, _) = hkcu.create_subkey(format!(r"Software\Classes\{PROG_ID}"))?;
    prog.set_value("", &"MDmeow Document")?;
    let (default_icon, _) = prog.create_subkey("DefaultIcon")?;
    default_icon.set_value("", &icon)?;
    let (prog_command, _) = prog.create_subkey(r"shell\open\command")?;
    prog_command.set_value("", &command)?;

    let (app, _) = hkcu.create_subkey(format!(r"Software\Classes\Applications\{app_exe}"))?;
    app.set_value("FriendlyAppName", &"MDmeow")?;
    let (app_command, _) = app.create_subkey(r"shell\open\command")?;
    app_command.set_value("", &command)?;
    let (supported, _) = app.create_subkey("SupportedTypes")?;

    let (registered_apps, _) = hkcu.create_subkey(r"Software\RegisteredApplications")?;
    registered_apps.set_value("MDmeow", &r"Software\MDmeow\Capabilities")?;
    let (capabilities, _) = hkcu.create_subkey(r"Software\MDmeow\Capabilities")?;
    capabilities.set_value("ApplicationName", &"MDmeow")?;
    capabilities.set_value(
        "ApplicationDescription",
        &"Lightweight Markdown and code document reviewer",
    )?;
    capabilities.set_value("ApplicationIcon", &icon)?;
    let (file_associations, _) = capabilities.create_subkey("FileAssociations")?;

    clear_extension_values(hkcu, app_exe);
    for ext in &extensions {
        supported.set_value(ext, &"")?;
        file_associations.set_value(ext, &PROG_ID)?;
        let (progids, _) =
            hkcu.create_subkey(format!(r"Software\Classes\{ext}\OpenWithProgids"))?;
        progids.set_value(PROG_ID, &"")?;
        let (open_with, _) =
            hkcu.create_subkey(format!(r"Software\Classes\{ext}\OpenWithList"))?;
        open_with.set_value(app_exe, &"")?;
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn write_registration(
    hkcu: &winreg::RegKey,
    exe: &std::path::Path,
    app_exe: &str,
) -> anyhow::Result<()> {
    let extensions = EXTENSIONS.iter().map(|ext| (*ext).to_string()).collect::<Vec<_>>();
    write_registration_for_extensions(hkcu, exe, app_exe, &extensions)
}

#[cfg(target_os = "windows")]
fn registered_extensions_for(exe: &std::path::Path, app_exe: &str) -> Vec<String> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let command_path = format!(r"Software\Classes\Applications\{app_exe}\shell\open\command");
    if !command_matches(read_string(&hkcu, &command_path, ""), exe) {
        return Vec::new();
    }

    let supported_path = format!(r"Software\Classes\Applications\{app_exe}\SupportedTypes");
    SUPPORTED_EXTENSIONS
        .iter()
        .filter(|ext| read_string(&hkcu, &supported_path, ext).is_some())
        .map(|ext| (*ext).to_string())
        .collect()
}

#[cfg(target_os = "windows")]
fn remove_registration(
    hkcu: &winreg::RegKey,
    app_exe: &str,
    remove_prog_id: bool,
) -> anyhow::Result<()> {
    use std::io::ErrorKind;
    use winreg::enums::KEY_WRITE;

    for ext in SUPPORTED_EXTENSIONS {
        if let Ok(key) = hkcu.open_subkey_with_flags(
            format!(r"Software\Classes\{ext}\OpenWithProgids"),
            KEY_WRITE,
        ) {
            if remove_prog_id {
                let _ = key.delete_value(PROG_ID);
            }
        }
        if let Ok(key) = hkcu.open_subkey_with_flags(
            format!(r"Software\Classes\{ext}\OpenWithList"),
            KEY_WRITE,
        ) {
            let _ = key.delete_value(app_exe);
        }
    }

    if remove_prog_id {
        let path = format!(r"Software\Classes\{PROG_ID}");
        if let Err(err) = hkcu.delete_subkey_all(path) {
            if err.kind() != ErrorKind::NotFound {
                return Err(err.into());
            }
        }
        let _ = hkcu.delete_subkey_all(r"Software\MDmeow\Capabilities");
        if let Ok(key) = hkcu.open_subkey_with_flags(
            r"Software\RegisteredApplications",
            KEY_WRITE,
        ) {
            let _ = key.delete_value("MDmeow");
        }
    }

    let app_path = format!(r"Software\Classes\Applications\{app_exe}");
    if let Err(err) = hkcu.delete_subkey_all(app_path) {
        if err.kind() != ErrorKind::NotFound {
            return Err(err.into());
        }
    }

    Ok(())
}

#[cfg(target_os = "windows")]
pub fn open_with_status() -> OpenWithStatus {
    let Ok((current_exe, current_name)) = current_exe_and_name() else {
        return OpenWithStatus {
            available: true,
            registered: false,
            managed_by_msi: false,
            can_modify: false,
            registered_extensions: Vec::new(),
        };
    };

    if let Some(msi) = valid_msi_registration() {
        let app_exe = msi
            .executable_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("MDmeow.exe");
        let registered_extensions = registered_extensions_for(&msi.executable_path, app_exe);
        return OpenWithStatus {
            available: true,
            registered: EXTENSIONS
                .iter()
                .all(|ext| registered_extensions.iter().any(|item| item == ext)),
            managed_by_msi: true,
            can_modify: crate::portable::same_path(&current_exe, &msi.executable_path),
            registered_extensions,
        };
    }

    let registered_extensions = registered_extensions_for(&current_exe, &current_name);
    OpenWithStatus {
        available: true,
        registered: EXTENSIONS
            .iter()
            .all(|ext| registered_extensions.iter().any(|item| item == ext)),
        managed_by_msi: false,
        can_modify: true,
        registered_extensions,
    }
}

#[cfg(not(target_os = "windows"))]
pub fn open_with_status() -> OpenWithStatus {
    OpenWithStatus {
        available: false,
        registered: false,
        managed_by_msi: false,
        can_modify: false,
        registered_extensions: Vec::new(),
    }
}

#[cfg(target_os = "windows")]
pub fn register_open_with() -> anyhow::Result<OpenWithStatus> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let (current_exe, current_name) = current_exe_and_name()?;
    if let Some(msi) = valid_msi_registration() {
        if !crate::portable::same_path(&current_exe, &msi.executable_path) {
            return Ok(open_with_status());
        }
    }

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    cleanup_legacy(&hkcu)?;
    let keep = is_versioned_portable_app(&current_name).then_some(current_name.as_str());
    cleanup_old_portable_entries(&hkcu, keep)?;
    write_registration(&hkcu, &current_exe, &current_name)?;

    Ok(open_with_status())
}

#[cfg(target_os = "windows")]
pub fn register_file_associations(extensions: Vec<String>) -> anyhow::Result<OpenWithStatus> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let (current_exe, current_name) = current_exe_and_name()?;
    if let Some(msi) = valid_msi_registration() {
        if !crate::portable::same_path(&current_exe, &msi.executable_path) {
            return Ok(open_with_status());
        }
    }

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    cleanup_legacy(&hkcu)?;
    let keep = is_versioned_portable_app(&current_name).then_some(current_name.as_str());
    cleanup_old_portable_entries(&hkcu, keep)?;
    write_registration_for_extensions(&hkcu, &current_exe, &current_name, &extensions)?;
    Ok(open_with_status())
}

#[cfg(not(target_os = "windows"))]
pub fn register_file_associations(_extensions: Vec<String>) -> anyhow::Result<OpenWithStatus> {
    Ok(open_with_status())
}

#[cfg(not(target_os = "windows"))]
pub fn register_open_with() -> anyhow::Result<OpenWithStatus> {
    Ok(open_with_status())
}

#[cfg(target_os = "windows")]
pub fn unregister_open_with() -> anyhow::Result<OpenWithStatus> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let (current_exe, current_name) = current_exe_and_name()?;
    if let Some(msi) = valid_msi_registration() {
        if !crate::portable::same_path(&current_exe, &msi.executable_path) {
            return Ok(open_with_status());
        }
    }

    if prog_id_points_to(&current_exe) {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        remove_registration(&hkcu, &current_name, true)?;
        cleanup_legacy(&hkcu)?;
    }

    Ok(open_with_status())
}

#[cfg(not(target_os = "windows"))]
pub fn unregister_open_with() -> anyhow::Result<OpenWithStatus> {
    Ok(open_with_status())
}

/// If a previous versioned portable EXE owns MDmeow.Markdown, move that
/// ownership to the currently running portable EXE. A complete MSI
/// registration always wins and is left untouched.
#[cfg(target_os = "windows")]
pub fn maintain_portable_registration() -> anyhow::Result<()> {
    if crate::portable::current_mode() != crate::portable::InstallMode::Portable {
        return Ok(());
    }
    if valid_msi_registration().is_some() {
        return Ok(());
    }
    if prog_id_owned_by_versioned_portable() {
        register_open_with()?;
    }
    Ok(())
}

/// Private command-line hooks used by the MSI lifecycle. They execute before
/// Tauri/WebView startup, so no UI is created during install/repair/uninstall.
#[cfg(target_os = "windows")]
pub fn installer_cli_action() -> Option<anyhow::Result<()>> {
    let action = std::env::args().nth(1)?;
    match action.as_str() {
        "--mdmeow-msi-register" => Some(register_current_installed()),
        "--mdmeow-msi-unregister" => Some(unregister_current_installed()),
        _ => None,
    }
}

#[cfg(target_os = "windows")]
fn register_current_installed() -> anyhow::Result<()> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let (current_exe, current_name) = current_exe_and_name()?;
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    cleanup_legacy(&hkcu)?;
    cleanup_old_portable_entries(&hkcu, None)?;
    write_registration(&hkcu, &current_exe, &current_name)?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn unregister_current_installed() -> anyhow::Result<()> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let (current_exe, current_name) = current_exe_and_name()?;
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if prog_id_points_to(&current_exe) {
        remove_registration(&hkcu, &current_name, true)?;
    } else {
        remove_registration(&hkcu, &current_name, false)?;
    }
    Ok(())
}
