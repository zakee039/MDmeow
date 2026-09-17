use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct OpenWithStatus {
    pub available: bool,
    pub registered: bool,
}

#[cfg(target_os = "windows")]
const PROG_ID: &str = "Mowl.Markdown";
#[cfg(target_os = "windows")]
const APP_EXE: &str = "mowl.exe";
#[cfg(target_os = "windows")]
const EXTENSIONS: [&str; 3] = [".md", ".markdown", ".mdx"];

#[cfg(target_os = "windows")]
fn expected_command() -> anyhow::Result<String> {
    let exe = std::env::current_exe()?;
    Ok(format!("\"{}\" \"%1\"", exe.display()))
}

#[cfg(target_os = "windows")]
fn read_string(key: &winreg::RegKey, path: &str, name: &str) -> Option<String> {
    key.open_subkey(path).ok()?.get_value(name).ok()
}

#[cfg(target_os = "windows")]
pub fn open_with_status() -> OpenWithStatus {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let expected = match expected_command() {
        Ok(v) => v,
        Err(_) => {
            return OpenWithStatus {
                available: true,
                registered: false,
            }
        }
    };

    let prog_command = read_string(
        &hkcu,
        r"Software\Classes\Mowl.Markdown\shell\open\command",
        "",
    );
    let app_command = read_string(
        &hkcu,
        r"Software\Classes\Applications\mowl.exe\shell\open\command",
        "",
    );
    if prog_command.as_deref() != Some(expected.as_str())
        || app_command.as_deref() != Some(expected.as_str())
    {
        return OpenWithStatus {
            available: true,
            registered: false,
        };
    }

    for ext in EXTENSIONS {
        let progids = format!(r"Software\Classes\{ext}\OpenWithProgids");
        let open_with = format!(r"Software\Classes\{ext}\OpenWithList");
        let supported = r"Software\Classes\Applications\mowl.exe\SupportedTypes";
        if read_string(&hkcu, &progids, PROG_ID).is_none()
            || read_string(&hkcu, &open_with, APP_EXE).is_none()
            || read_string(&hkcu, supported, ext).is_none()
        {
            return OpenWithStatus {
                available: true,
                registered: false,
            };
        }
    }

    OpenWithStatus {
        available: true,
        registered: true,
    }
}

#[cfg(not(target_os = "windows"))]
pub fn open_with_status() -> OpenWithStatus {
    OpenWithStatus {
        available: false,
        registered: false,
    }
}

#[cfg(target_os = "windows")]
pub fn register_open_with() -> anyhow::Result<OpenWithStatus> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let command = expected_command()?;
    let exe = std::env::current_exe()?;
    let icon = format!("\"{}\",0", exe.display());

    let (prog, _) = hkcu.create_subkey(r"Software\Classes\Mowl.Markdown")?;
    prog.set_value("", &"Mowl Markdown Document")?;
    let (default_icon, _) = prog.create_subkey("DefaultIcon")?;
    default_icon.set_value("", &icon)?;
    let (prog_command, _) = prog.create_subkey(r"shell\open\command")?;
    prog_command.set_value("", &command)?;

    let (app, _) = hkcu.create_subkey(r"Software\Classes\Applications\mowl.exe")?;
    app.set_value("FriendlyAppName", &"Mowl")?;
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
        open_with.set_value(APP_EXE, &"")?;
    }

    Ok(open_with_status())
}

#[cfg(not(target_os = "windows"))]
pub fn register_open_with() -> anyhow::Result<OpenWithStatus> {
    Ok(open_with_status())
}

#[cfg(target_os = "windows")]
pub fn unregister_open_with() -> anyhow::Result<OpenWithStatus> {
    use std::io::ErrorKind;
    use winreg::enums::{HKEY_CURRENT_USER, KEY_WRITE};
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    for ext in EXTENSIONS {
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
            let _ = key.delete_value(APP_EXE);
        }
    }

    for path in [
        r"Software\Classes\Mowl.Markdown",
        r"Software\Classes\Applications\mowl.exe",
    ] {
        if let Err(err) = hkcu.delete_subkey_all(path) {
            if err.kind() != ErrorKind::NotFound {
                return Err(err.into());
            }
        }
    }

    Ok(open_with_status())
}

#[cfg(not(target_os = "windows"))]
pub fn unregister_open_with() -> anyhow::Result<OpenWithStatus> {
    Ok(open_with_status())
}
