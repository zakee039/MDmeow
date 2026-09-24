[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ReleaseDir = Join-Path $Root "release"
$StageDir = Join-Path $Root "release.__staging"
$TargetRelease = Join-Path $Root "src-tauri\target\release"
$TargetBundle = Join-Path $TargetRelease "bundle"

function Read-CargoVersion {
    $match = Select-String -Path (Join-Path $Root "src-tauri\Cargo.toml") -Pattern '^version\s*=\s*"([^"]+)"' | Select-Object -First 1
    if (-not $match) { throw "Unable to read version from src-tauri/Cargo.toml" }
    return $match.Matches[0].Groups[1].Value
}

function Remove-IfExists([string]$Path) {
    if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Recurse -Force
    }
}

function Get-Sha256Hex([string]$Path) {
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $sha = [System.Security.Cryptography.SHA256]::Create()
        try {
            $bytes = $sha.ComputeHash($stream)
            return (($bytes | ForEach-Object { $_.ToString("x2") }) -join "").ToUpperInvariant()
        }
        finally {
            $sha.Dispose()
        }
    }
    finally {
        $stream.Dispose()
    }
}

Push-Location $Root
try {
    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
        $cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
        if (Test-Path -LiteralPath (Join-Path $cargoBin "cargo.exe")) {
            $env:PATH = "$cargoBin;$env:PATH"
        } else {
            throw "Rust cargo was not found in PATH or $cargoBin."
        }
    }

    $tauriSecretDir = Join-Path $env:USERPROFILE ".tauri"
    $localCredentialPath = Join-Path $tauriSecretDir "mdmeow-updater.key"
    $releaseCredentialPath = $null
    $useEnvironmentSigningKey = $false

    # Local releases use ~/.tauri/mdmeow-updater.key. CI can inject the same
    # Minisign/Tauri updater private key through GitHub Actions secrets without
    # ever committing it to the repository.
    if (-not [string]::IsNullOrWhiteSpace($env:TAURI_SIGNING_PRIVATE_KEY)) {
        # Tauri CLI natively consumes TAURI_SIGNING_PRIVATE_KEY (and optional
        # TAURI_SIGNING_PRIVATE_KEY_PASSWORD). Do not also pass -f here: that
        # would provide both --private-key and --private-key-path, which are
        # mutually exclusive.
        $useEnvironmentSigningKey = $true
        Write-Host "[release] Using updater signing credential from environment."
    } elseif (Test-Path -LiteralPath $localCredentialPath) {
        $releaseCredentialPath = $localCredentialPath
        Write-Host "[release] Using local updater signing credential."
    } else {
        throw "MDmeow updater signing credential was not found. Provide TAURI_SIGNING_PRIVATE_KEY or $localCredentialPath."
    }
    $package = Get-Content -LiteralPath "package.json" -Raw | ConvertFrom-Json
    $tauri = Get-Content -LiteralPath "src-tauri\tauri.conf.json" -Raw | ConvertFrom-Json
    $cargoVersion = Read-CargoVersion
    $version = [string]$package.version

    if ($tauri.version -ne $version -or $cargoVersion -ne $version) {
        throw "Version mismatch: package.json=$version, tauri.conf.json=$($tauri.version), Cargo.toml=$cargoVersion"
    }

    $conflicts = @(git diff --name-only --diff-filter=U)
    if ($conflicts.Count -gt 0) {
        throw "Unresolved merge conflicts: $($conflicts -join ', ')"
    }

    $dirty = @(git status --short)
    if ($dirty.Count -gt 0) {
        Write-Host "[release] Working tree has expected local changes:"
        $dirty | ForEach-Object { Write-Host "  $_" }
    } else {
        Write-Host "[release] Working tree is clean."
    }

    Remove-IfExists $StageDir
    Remove-IfExists $TargetBundle

    Write-Host "[release] Building frontend..."
    pnpm build
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed." }

    # Release LTO can make Cargo compile/link the library and binary in parallel,
    # which is unnecessarily memory-heavy on Windows and can leave orphaned
    # linker processes after one job fails. Keep the final release deterministic
    # and conservative; callers can still override this explicitly if needed.
    if (-not $env:CARGO_BUILD_JOBS) {
        $env:CARGO_BUILD_JOBS = "1"
    }
    Write-Host "[release] Cargo build jobs: $env:CARGO_BUILD_JOBS"

    Write-Host "[release] Building Tauri MSI..."
    pnpm tauri build --bundles msi
    if ($LASTEXITCODE -ne 0) { throw "Tauri MSI build failed." }

    $internalExe = Join-Path $TargetRelease "MDmeow.exe"
    if (-not (Test-Path -LiteralPath $internalExe)) {
        throw "Expected internal executable not found: $internalExe"
    }

    $msiDir = Join-Path $TargetRelease "bundle\msi"
    $msis = @(Get-ChildItem -LiteralPath $msiDir -Filter "*.msi" -File)
    if ($msis.Count -ne 1) {
        throw "Expected exactly one MSI in $msiDir, found $($msis.Count)."
    }
    New-Item -ItemType Directory -Path $StageDir | Out-Null
    $portableName = "MDmeow-$version.exe"
    $msiName = "MDmeow_$($version)_x64.msi"
    $portablePath = Join-Path $StageDir $portableName
    $msiPath = Join-Path $StageDir $msiName
    Copy-Item -LiteralPath $internalExe -Destination $portablePath
    Copy-Item -LiteralPath $msis[0].FullName -Destination $msiPath

    Write-Host "[release] Signing Windows artifacts..."
    if ($useEnvironmentSigningKey) {
        pnpm tauri signer sign $portablePath
    } else {
        pnpm tauri signer sign -f $releaseCredentialPath --password= $portablePath
    }
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath "$portablePath.sig")) {
        throw "Portable executable signing failed."
    }
    if ($useEnvironmentSigningKey) {
        pnpm tauri signer sign $msiPath
    } else {
        pnpm tauri signer sign -f $releaseCredentialPath --password= $msiPath
    }
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath "$msiPath.sig")) {
        throw "MSI signing failed."
    }

    $releaseBase = "https://github.com/zakee039/MDmeow/releases/download/v$version"
    $latest = @{
        version = $version
        platforms = @{
            "windows-x86_64" = @{
                url = "$releaseBase/$msiName"
                signature = (Get-Content -LiteralPath "$msiPath.sig" -Raw).Trim()
            }
        }
    }
    $latest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $StageDir "latest.json") -Encoding utf8

    $files = @(Get-ChildItem -LiteralPath $StageDir -File)
    $expected = @(
        $portableName,
        "$portableName.sig",
        $msiName,
        "$msiName.sig",
        "latest.json"
    )
    if ($files.Count -ne $expected.Count -or @($files.Name | Where-Object { $_ -notin $expected }).Count -ne 0) {
        throw "Release staging validation failed; updater artifact set is incomplete."
    }

    if (-not (Test-Path -LiteralPath $ReleaseDir)) {
        New-Item -ItemType Directory -Path $ReleaseDir | Out-Null
    }
    foreach ($name in $expected) {
        Copy-Item -LiteralPath (Join-Path $StageDir $name) -Destination (Join-Path $ReleaseDir $name) -Force
    }
    Remove-IfExists $StageDir

    Write-Host ""
    Write-Host "=== MDmeow release build ==="
    Write-Host "Version: $version"
    Write-Host "Artifacts:"
    $expected | Sort-Object | ForEach-Object {
        $file = Get-Item -LiteralPath (Join-Path $ReleaseDir $_)
        $hash = Get-Sha256Hex $file.FullName
        Write-Host ("  {0}  {1} bytes" -f $file.Name, $file.Length)
        Write-Host ("    SHA256 {0}" -f $hash)
    }
    Write-Host "Result: PASS (signed Windows release + updater metadata)"
}
catch {
    Remove-IfExists $StageDir
    Write-Error $_
    exit 1
}
finally {
    Pop-Location
}
