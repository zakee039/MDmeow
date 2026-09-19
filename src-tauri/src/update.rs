//! GitHub Release based updater.
//!
//! Windows installed builds download a signed MSI to MDmeow's local update
//! cache and launch it in passive mode. Portable builds download a signed new
//! EXE beside the currently running EXE and never overwrite the running file.
//! All network traffic shares MDmeow's explicit HTTP/HTTPS/SOCKS5 proxy layer.

use std::{
    path::{Path, PathBuf},
    process::Command,
    time::Duration,
};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use minisign_verify::{PublicKey, Signature};
use reqwest::header::{ACCEPT, CONTENT_LENGTH, USER_AGENT};
use semver::Version;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::{
    portable::{self, InstallMode},
    proxy::{network_client, USER_AGENT_VALUE},
};

const LATEST_RELEASE_API: &str =
    "https://api.github.com/repos/zakee039/MDmeow/releases/latest";
const UPDATE_PUBLIC_KEY: &str = include_str!("../updater.pub");
const MAX_UPDATE_BYTES: usize = 512 * 1024 * 1024;

#[derive(Debug, Clone, Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

#[derive(Debug, Clone, Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: String,
    body: Option<String>,
    published_at: Option<String>,
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub mode: String,
    pub release_url: String,
    pub notes: String,
    pub published_at: Option<String>,
    pub can_download: bool,
    pub asset_name: Option<String>,
    pub asset_size: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadedUpdate {
    pub version: String,
    pub mode: String,
    pub path: String,
    pub already_downloaded: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateDownloadProgress {
    downloaded: u64,
    total: u64,
}

fn parse_version(value: &str) -> Result<Version, String> {
    Version::parse(value.trim().trim_start_matches('v'))
        .map_err(|e| format!("invalid release version '{value}': {e}"))
}

fn mode_name() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        match portable::current_mode() {
            InstallMode::Portable => "portable",
            InstallMode::Installed => "installed",
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        "unsupported"
    }
}

fn artifact_names(version: &str, mode: &str) -> Option<(String, String)> {
    match mode {
        "portable" => {
            let name = format!("MDmeow-{version}.exe");
            Some((name.clone(), format!("{name}.sig")))
        }
        "installed" => {
            let name = format!("MDmeow_{version}_x64.msi");
            Some((name.clone(), format!("{name}.sig")))
        }
        _ => None,
    }
}

fn find_asset<'a>(release: &'a GithubRelease, name: &str) -> Option<&'a GithubAsset> {
    release.assets.iter().find(|asset| asset.name == name)
}

async fn fetch_latest_release(
    proxy_enabled: bool,
    proxy_url: &str,
) -> Result<GithubRelease, String> {
    let client = network_client(proxy_enabled, proxy_url, Duration::from_secs(15))?;
    let response = client
        .get(LATEST_RELEASE_API)
        .header(USER_AGENT, USER_AGENT_VALUE)
        .header(ACCEPT, "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("could not connect to GitHub: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "GitHub returned HTTP {} while checking for updates",
            response.status()
        ));
    }

    response
        .json::<GithubRelease>()
        .await
        .map_err(|e| format!("invalid GitHub release response: {e}"))
}

fn release_info(release: &GithubRelease) -> Result<UpdateInfo, String> {
    let current = parse_version(env!("CARGO_PKG_VERSION"))?;
    let latest = parse_version(&release.tag_name)?;
    let mode = mode_name().to_string();
    let update_available = latest > current;
    let latest_version = latest.to_string();

    let pair = artifact_names(&latest_version, &mode);
    let (asset_name, asset_size, can_download) = if let Some((asset_name, sig_name)) = pair {
        let asset = find_asset(release, &asset_name);
        let sig = find_asset(release, &sig_name);
        (
            Some(asset_name),
            asset.map(|item| item.size),
            asset.is_some() && sig.is_some(),
        )
    } else {
        (None, None, false)
    };

    Ok(UpdateInfo {
        current_version: current.to_string(),
        latest_version,
        update_available,
        mode,
        release_url: release.html_url.clone(),
        notes: release.body.clone().unwrap_or_default(),
        published_at: release.published_at.clone(),
        can_download,
        asset_name,
        asset_size,
    })
}

#[tauri::command]
pub async fn check_for_update(
    proxy_enabled: bool,
    proxy_url: String,
) -> Result<UpdateInfo, String> {
    let release = fetch_latest_release(proxy_enabled, &proxy_url).await?;
    release_info(&release)
}

async fn fetch_signature(
    client: &reqwest::Client,
    asset: &GithubAsset,
) -> Result<String, String> {
    let response = client
        .get(&asset.browser_download_url)
        .header(USER_AGENT, USER_AGENT_VALUE)
        .send()
        .await
        .map_err(|e| format!("could not download update signature: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "signature download returned HTTP {}",
            response.status()
        ));
    }
    let text = response
        .text()
        .await
        .map_err(|e| format!("could not read update signature: {e}"))?;
    if text.trim().is_empty() || text.len() > 64 * 1024 {
        return Err("update signature is invalid".to_string());
    }
    Ok(text.trim().to_string())
}

async fn fetch_artifact(
    app: &AppHandle,
    client: &reqwest::Client,
    asset: &GithubAsset,
) -> Result<Vec<u8>, String> {
    let mut response = client
        .get(&asset.browser_download_url)
        .header(USER_AGENT, USER_AGENT_VALUE)
        .send()
        .await
        .map_err(|e| format!("could not download update: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "update download returned HTTP {}",
            response.status()
        ));
    }

    let total = response
        .headers()
        .get(CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
        .or_else(|| response.content_length())
        .unwrap_or(asset.size);

    if total as usize > MAX_UPDATE_BYTES || asset.size as usize > MAX_UPDATE_BYTES {
        return Err("update package is unexpectedly large".to_string());
    }

    let mut buffer = Vec::with_capacity((total as usize).min(32 * 1024 * 1024));
    let mut downloaded = 0u64;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("update download interrupted: {e}"))?
    {
        if buffer.len().saturating_add(chunk.len()) > MAX_UPDATE_BYTES {
            return Err("update package exceeded the size limit".to_string());
        }
        buffer.extend_from_slice(&chunk);
        downloaded += chunk.len() as u64;
        let _ = app.emit(
            "update-download-progress",
            UpdateDownloadProgress { downloaded, total },
        );
    }

    if asset.size > 0 && downloaded != asset.size {
        return Err(format!(
            "update size mismatch: expected {} bytes, received {}",
            asset.size, downloaded
        ));
    }

    Ok(buffer)
}

fn decode_base64_text(value: &str, label: &str) -> Result<String, String> {
    let bytes = BASE64
        .decode(value.trim())
        .map_err(|e| format!("invalid {label} encoding: {e}"))?;
    String::from_utf8(bytes).map_err(|e| format!("invalid {label} text: {e}"))
}

fn verify_signature(data: &[u8], signature: &str) -> Result<(), String> {
    let public_key_text = decode_base64_text(UPDATE_PUBLIC_KEY, "update public key")?;
    let public_key =
        PublicKey::decode(&public_key_text).map_err(|e| format!("invalid update public key: {e}"))?;
    let signature_text = decode_base64_text(signature, "update signature")?;
    let signature =
        Signature::decode(&signature_text).map_err(|e| format!("invalid update signature: {e}"))?;

    public_key
        .verify(data, &signature, true)
        .map_err(|e| format!("update signature verification failed: {e}"))
}

fn update_cache_dir() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        match portable::current_mode() {
            InstallMode::Portable => portable::portable_dir()
                .map(|dir| dir.join("data").join("updates"))
                .ok_or_else(|| "cannot locate portable program directory".to_string()),
            InstallMode::Installed => portable::local_data_base()
                .map(|dir| dir.join("MDmeow").join("updates"))
                .ok_or_else(|| "cannot locate application data directory".to_string()),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("in-app update download is not enabled on this platform yet".to_string())
    }
}

fn destination_path(version: &str, mode: &str) -> Result<PathBuf, String> {
    let (asset_name, _) = artifact_names(version, mode)
        .ok_or_else(|| "in-app update download is not enabled on this platform yet".to_string())?;

    match mode {
        "portable" => portable::portable_dir()
            .map(|dir| dir.join(asset_name))
            .ok_or_else(|| "cannot locate portable program directory".to_string()),
        "installed" => Ok(update_cache_dir()?.join(asset_name)),
        _ => Err("in-app update download is not enabled on this platform yet".to_string()),
    }
}

fn signature_cache_path(version: &str, mode: &str) -> Result<PathBuf, String> {
    let (asset_name, _) = artifact_names(version, mode)
        .ok_or_else(|| "unsupported update mode".to_string())?;
    Ok(update_cache_dir()?.join(format!("{asset_name}.sig")))
}

fn write_atomic(path: &Path, data: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("invalid update path: {}", path.display()))?;
    std::fs::create_dir_all(parent)
        .map_err(|e| format!("cannot create update directory {}: {e}", parent.display()))?;

    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "invalid update file name".to_string())?;
    let partial = parent.join(format!("{file_name}.part"));
    let _ = std::fs::remove_file(&partial);
    std::fs::write(&partial, data)
        .map_err(|e| format!("cannot write update file {}: {e}", partial.display()))?;

    if path.exists() {
        std::fs::remove_file(path)
            .map_err(|e| format!("cannot replace existing update {}: {e}", path.display()))?;
    }
    std::fs::rename(&partial, path)
        .map_err(|e| format!("cannot finalize update file {}: {e}", path.display()))
}

fn verify_local_update(version: &str, mode: &str) -> Result<PathBuf, String> {
    let path = destination_path(version, mode)?;
    let sig_path = signature_cache_path(version, mode)?;
    let data = std::fs::read(&path)
        .map_err(|e| format!("cannot read downloaded update {}: {e}", path.display()))?;
    let signature = std::fs::read_to_string(&sig_path)
        .map_err(|e| format!("cannot read downloaded update signature: {e}"))?;
    verify_signature(&data, signature.trim())?;
    Ok(path)
}

#[tauri::command]
pub async fn download_update(
    app: AppHandle,
    expected_version: String,
    proxy_enabled: bool,
    proxy_url: String,
) -> Result<DownloadedUpdate, String> {
    let expected = parse_version(&expected_version)?;
    let current = parse_version(env!("CARGO_PKG_VERSION"))?;
    if expected <= current {
        return Err("requested update is not newer than the current version".to_string());
    }

    let release = fetch_latest_release(proxy_enabled, &proxy_url).await?;
    let latest = parse_version(&release.tag_name)?;
    if latest != expected {
        return Err(format!(
            "latest GitHub release changed from {} to {}; check again",
            expected, latest
        ));
    }

    let mode = mode_name();
    let (asset_name, sig_name) = artifact_names(&latest.to_string(), mode)
        .ok_or_else(|| "in-app update download is not enabled on this platform yet".to_string())?;
    let asset = find_asset(&release, &asset_name)
        .ok_or_else(|| format!("release asset not found: {asset_name}"))?;
    let sig_asset = find_asset(&release, &sig_name)
        .ok_or_else(|| format!("release signature not found: {sig_name}"))?;

    let client = network_client(proxy_enabled, &proxy_url, Duration::from_secs(180))?;
    let signature = fetch_signature(&client, sig_asset).await?;
    let destination = destination_path(&latest.to_string(), mode)?;
    let sig_cache = signature_cache_path(&latest.to_string(), mode)?;

    if destination.is_file() {
        if let Ok(existing) = std::fs::read(&destination) {
            if verify_signature(&existing, &signature).is_ok() {
                write_atomic(&sig_cache, signature.as_bytes())?;
                let _ = app.emit(
                    "update-download-progress",
                    UpdateDownloadProgress {
                        downloaded: existing.len() as u64,
                        total: existing.len() as u64,
                    },
                );
                return Ok(DownloadedUpdate {
                    version: latest.to_string(),
                    mode: mode.to_string(),
                    path: destination.display().to_string(),
                    already_downloaded: true,
                });
            }
        }
    }

    let data = fetch_artifact(&app, &client, asset).await?;
    verify_signature(&data, &signature)?;
    write_atomic(&destination, &data)?;
    write_atomic(&sig_cache, signature.as_bytes())?;

    Ok(DownloadedUpdate {
        version: latest.to_string(),
        mode: mode.to_string(),
        path: destination.display().to_string(),
        already_downloaded: false,
    })
}

#[tauri::command]
pub fn open_portable_update(version: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if portable::current_mode() != InstallMode::Portable {
            return Err("current MDmeow is not running in portable mode".to_string());
        }
        let version = parse_version(&version)?.to_string();
        let path = verify_local_update(&version, "portable")?;
        // MDmeow is single-instance. Launch through a short-lived helper after
        // the current process has had time to exit, otherwise the new EXE would
        // simply hand control back to the old instance.
        let escaped_path = path.to_string_lossy().replace(char::from(39), "''");
        let launch_script = format!(
            "Start-Sleep -Milliseconds 900; Start-Process -FilePath '{}'",
            escaped_path
        );
        Command::new("powershell.exe")
            .arg("-NoProfile")
            .arg("-WindowStyle")
            .arg("Hidden")
            .arg("-Command")
            .arg(launch_script)
            .spawn()
            .map_err(|e| format!("cannot open new MDmeow version: {e}"))?;
        return Ok(());
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = version;
        Err("portable update launch is only supported on Windows".to_string())
    }
}

#[tauri::command]
pub fn reveal_portable_update(version: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if portable::current_mode() != InstallMode::Portable {
            return Err("current MDmeow is not running in portable mode".to_string());
        }
        let version = parse_version(&version)?.to_string();
        let path = verify_local_update(&version, "portable")?;
        Command::new("explorer.exe")
            .arg(format!("/select,{}", path.display()))
            .spawn()
            .map_err(|e| format!("cannot open update folder: {e}"))?;
        return Ok(());
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = version;
        Err("update folder reveal is only supported on Windows".to_string())
    }
}

#[tauri::command]
pub fn install_downloaded_update(version: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if portable::current_mode() != InstallMode::Installed {
            return Err("current MDmeow is not running in installed mode".to_string());
        }
        let version = parse_version(&version)?.to_string();
        let path = verify_local_update(&version, "installed")?;
        Command::new("msiexec.exe")
            .arg("/i")
            .arg(&path)
            .arg("/passive")
            .arg("/norestart")
            .spawn()
            .map_err(|e| format!("cannot start MDmeow installer: {e}"))?;
        return Ok(());
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = version;
        Err("installed update is only supported on Windows".to_string())
    }
}

#[tauri::command]
pub async fn prepare_new_version(
    app: AppHandle,
    expected_version: String,
    proxy_enabled: bool,
    proxy_url: String,
) -> Result<DownloadedUpdate, String> {
    download_update(app, expected_version, proxy_enabled, proxy_url).await
}

#[tauri::command]
pub fn use_prepared_version(version: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        return match portable::current_mode() {
            InstallMode::Portable => open_portable_update(version),
            InstallMode::Installed => install_downloaded_update(version),
        };
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = version;
        Err("in-app update is not enabled on this platform yet".to_string())
    }
}

#[tauri::command]
pub fn show_prepared_version(version: String) -> Result<(), String> {
    reveal_portable_update(version)
}

#[cfg(test)]
mod tests {
    use super::{artifact_names, parse_version, release_info, GithubAsset, GithubRelease};

    #[test]
    fn parses_v_prefixed_versions() {
        assert_eq!(parse_version("v1.7.6").unwrap().to_string(), "1.7.6");
        assert_eq!(parse_version("1.7.6").unwrap().to_string(), "1.7.6");
    }

    #[test]
    fn windows_asset_contract_is_stable() {
        assert_eq!(
            artifact_names("1.7.6", "portable").unwrap().0,
            "MDmeow-1.7.6.exe"
        );
        assert_eq!(
            artifact_names("1.7.6", "installed").unwrap().0,
            "MDmeow_1.7.6_x64.msi"
        );
    }

    #[test]
    fn release_without_signatures_is_not_downloadable() {
        let release = GithubRelease {
            tag_name: "v9.9.9".to_string(),
            html_url: "https://example.invalid/release".to_string(),
            body: None,
            published_at: None,
            assets: vec![GithubAsset {
                name: "MDmeow-9.9.9.exe".to_string(),
                browser_download_url: "https://example.invalid/app.exe".to_string(),
                size: 1,
            }],
        };
        let info = release_info(&release).unwrap();
        assert!(info.update_available);
        assert!(!info.can_download);
    }

}
