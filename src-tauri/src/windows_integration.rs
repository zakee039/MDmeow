use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct OpenWithStatus {
    pub available: bool,
    pub registered: bool,
    pub managed_by_msi: bool,
    pub can_modify: bool,
}

#[cfg(target_os = "windows")]
const PROG_ID: &str = "MDmeow.Markdown";
const LEGACY_APP_EXE: &str = "mowl.exe";
#[cfg(target_os = "windows")]
const LEGACY_PROG_IDS: [&str; 3] = ["Mowl.Markdown", "MDmeow.md", "MDmeow.markdown"];
#[cfg(target_os = "windows")]
const EXTENSIONS: [&str; 3] = [".md", ".markdown", ".mdx"];

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
fn registration_complete_for(exe: &std::path::Path, app_exe: &str) -> bool {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let prog_command_path = format!(r"Software\Classes\{PROG_ID}\shell\open\command");
    let app_command_path =
        format!(r"Software\Classes\Applications\{app_exe}\shell\open\command");

    if !command_matches(read_string(&hkcu, &prog_command_path, ""), exe)
        || !command_matches(read_string(&hkcu, &app_command_path, ""), exe)
    {
        return false;
    }

    for ext in EXTENSIONS {
        let progids = format!(r"Software\Classes\{ext}\OpenWithProgids");
        let open_with = format!(r"Software\Classes\{ext}\OpenWithList");
        let supported = format!(r"Software\Classes\Applications\{app_exe}\SupportedTypes");
        if read_string(&hkcu, &progids, PROG_ID).is_none()
            || read_string(&hkcu, &open_with, app_exe).is_none()
            || read_string(&hkcu, &supported, ext).is_none()
        {
            return false;
        }
    }

    true
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
    let info = crate::portable::msi_install_info()?;
    let app_exe = info.executable_path.file_name()?.to_str()?;
    registration_complete_for(&info.executable_path, app_exe).then_some(info)
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

    for ext in EXTENSIONS {
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
fn write_registration(
    hkcu: &winreg::RegKey,
    exe: &std::path::Path,
    app_exe: &str,
) -> anyhow::Result<()> {
    let command = expected_command(exe);
    let icon = format!("\"{}\",0", exe.display());

    let (prog, _) = hkcu.create_subkey(format!(r"Software\Classes\{PROG_ID}"))?;
    prog.set_value("", &"MDmeow Markdown Document")?;
    let (default_icon, _) = prog.create_subkey("DefaultIcon")?;
    default_icon.set_value("", &icon)?;
    let (prog_command, _) = prog.create_subkey(r"shell\open\command")?;
    prog_command.set_value("", &command)?;

    let (app, _) = hkcu.create_subkey(format!(r"Software\Classes\Applications\{app_exe}"))?;
    app.set_value("FriendlyAppName", &"MDmeow")?;
    let (app_command, _) = app.create_subkey(r"shell\open\command")?;
    app_command.set_value("", &command)?;
    let (supported, _) = app.create_subkey("SupportedTypes")?;

    for ext in EXTENSIONS {
        supported.set_value(ext, &"")?;
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
fn remove_registration(
    hkcu: &winreg::RegKey,
    app_exe: &str,
    remove_prog_id: bool,
) -> anyhow::Result<()> {
    use std::io::ErrorKind;
    use winreg::enums::KEY_WRITE;

    for ext in EXTENSIONS {
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
        };
    };

    if let Some(msi) = valid_msi_registration() {
        return OpenWithStatus {
            available: true,
            registered: true,
            managed_by_msi: true,
            can_modify: crate::portable::same_path(&current_exe, &msi.executable_path),
        };
    }

    OpenWithStatus {
        available: true,
        registered: registration_complete_for(&current_exe, &current_name),
        managed_by_msi: false,
        can_modify: true,
    }
}

#[cfg(not(target_os = "windows"))]
pub fn open_with_status() -> OpenWithStatus {
    OpenWithStatus {
        available: false,
        registered: false,
        managed_by_msi: false,
        can_modify: false,
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
