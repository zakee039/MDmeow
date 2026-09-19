//! HTTP/SOCKS proxy helpers for remote assets and the Settings connectivity test.

use std::time::Duration;

use reqwest::header::{CONTENT_LENGTH, CONTENT_TYPE, USER_AGENT};

use crate::assets::{base64_encode, MAX_IMAGE_BYTES};

const TEST_URL: &str = "https://github.com/favicon.ico";
pub(crate) const USER_AGENT_VALUE: &str = "MDmeow/1.7";

fn validated_proxy(proxy_url: &str) -> Result<reqwest::Proxy, String> {
    let raw = proxy_url.trim();
    if raw.is_empty() {
        return Err("proxy address is empty".to_string());
    }

    let parsed = reqwest::Url::parse(raw).map_err(|e| format!("invalid proxy address: {e}"))?;
    match parsed.scheme() {
        "http" | "https" | "socks5" | "socks5h" => {}
        scheme => {
            return Err(format!(
                "unsupported proxy scheme '{scheme}' (use http, https or socks5)"
            ))
        }
    }

    reqwest::Proxy::all(raw).map_err(|e| format!("invalid proxy address: {e}"))
}

fn remote_image_mime(src: &str, content_type: Option<&str>) -> &'static str {
    if let Some(value) = content_type {
        let mime = value.split(';').next().unwrap_or("").trim().to_ascii_lowercase();
        return match mime.as_str() {
            "image/png" => "image/png",
            "image/apng" => "image/apng",
            "image/jpeg" | "image/jpg" => "image/jpeg",
            "image/gif" => "image/gif",
            "image/webp" => "image/webp",
            "image/svg+xml" => "image/svg+xml",
            "image/bmp" => "image/bmp",
            "image/avif" => "image/avif",
            "image/x-icon" | "image/vnd.microsoft.icon" => "image/x-icon",
            _ => image_mime_from_path(src),
        };
    }
    image_mime_from_path(src)
}

fn image_mime_from_path(src: &str) -> &'static str {
    let path = reqwest::Url::parse(src)
        .ok()
        .map(|url| url.path().to_ascii_lowercase())
        .unwrap_or_else(|| src.to_ascii_lowercase());

    if path.ends_with(".png") {
        "image/png"
    } else if path.ends_with(".apng") {
        "image/apng"
    } else if path.ends_with(".jpg") || path.ends_with(".jpeg") || path.ends_with(".jfif") {
        "image/jpeg"
    } else if path.ends_with(".gif") {
        "image/gif"
    } else if path.ends_with(".webp") {
        "image/webp"
    } else if path.ends_with(".svg") {
        "image/svg+xml"
    } else if path.ends_with(".bmp") {
        "image/bmp"
    } else if path.ends_with(".avif") {
        "image/avif"
    } else if path.ends_with(".ico") {
        "image/x-icon"
    } else {
        "application/octet-stream"
    }
}

pub(crate) fn network_client(
    proxy_enabled: bool,
    proxy_url: &str,
    timeout: Duration,
) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .timeout(timeout)
        .redirect(reqwest::redirect::Policy::limited(5));
    builder = if proxy_enabled {
        builder.proxy(validated_proxy(proxy_url)?)
    } else {
        builder.no_proxy()
    };
    builder
        .build()
        .map_err(|e| format!("cannot create proxy client: {e}"))
}

#[tauri::command]
pub async fn test_proxy(proxy_url: String) -> Result<(), String> {
    let client = network_client(true, &proxy_url, Duration::from_secs(10))?;
    let response = client
        .get(TEST_URL)
        .header(USER_AGENT, USER_AGENT_VALUE)
        .send()
        .await
        .map_err(|e| format!("connection failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("upstream returned HTTP {}", response.status()));
    }
    Ok(())
}

#[tauri::command]
pub async fn fetch_remote_image_data_url(
    src: String,
    proxy_url: String,
) -> Result<String, String> {
    let parsed = reqwest::Url::parse(src.trim()).map_err(|e| format!("invalid image URL: {e}"))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("only http/https remote images can be proxied".to_string());
    }

    let client = network_client(true, &proxy_url, Duration::from_secs(20))?;
    let response = client
        .get(parsed)
        .header(USER_AGENT, USER_AGENT_VALUE)
        .send()
        .await
        .map_err(|e| format!("image request failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("image server returned HTTP {}", response.status()));
    }

    if response
        .headers()
        .get(CONTENT_LENGTH)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<usize>().ok())
        .is_some_and(|len| len > MAX_IMAGE_BYTES)
    {
        return Err("remote image is too large".to_string());
    }

    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("cannot read remote image: {e}"))?;
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err(format!(
            "remote image is too large ({} MiB)",
            bytes.len() / (1024 * 1024)
        ));
    }

    Ok(format!(
        "data:{};base64,{}",
        remote_image_mime(&src, content_type.as_deref()),
        base64_encode(&bytes)
    ))
}

#[cfg(test)]
mod tests {
    use super::{image_mime_from_path, validated_proxy};

    #[test]
    fn accepts_supported_proxy_schemes() {
        assert!(validated_proxy("http://127.0.0.1:7897").is_ok());
        assert!(validated_proxy("https://127.0.0.1:7897").is_ok());
        assert!(validated_proxy("socks5://127.0.0.1:7893").is_ok());
    }

    #[test]
    fn rejects_unknown_proxy_schemes() {
        assert!(validated_proxy("ftp://127.0.0.1:21").is_err());
        assert!(validated_proxy("").is_err());
    }

    #[test]
    fn guesses_remote_image_mime() {
        assert_eq!(image_mime_from_path("https://x.test/a.PNG?q=1"), "image/png");
        assert_eq!(image_mime_from_path("https://x.test/a.jpeg"), "image/jpeg");
    }
}
