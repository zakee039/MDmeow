[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ReleaseDir = Join-Path $Root "release"
$StageDir = Join-Path $Root "release.__staging"
$TargetRelease = Join-Path $Root "src-tauri\target\release"

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

    Remove-IfExists $ReleaseDir
    Remove-IfExists $StageDir
    Remove-IfExists $TargetRelease

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
    Copy-Item -LiteralPath $internalExe -Destination (Join-Path $StageDir $portableName)
    Copy-Item -LiteralPath $msis[0].FullName -Destination (Join-Path $StageDir $msiName)

    $files = @(Get-ChildItem -LiteralPath $StageDir -File)
    $expected = @($portableName, $msiName)
    if ($files.Count -ne 2 -or @($files.Name | Where-Object { $_ -notin $expected }).Count -ne 0) {
        throw "Release staging validation failed; only $portableName and $msiName are allowed."
    }

    Move-Item -LiteralPath $StageDir -Destination $ReleaseDir

    Write-Host ""
    Write-Host "=== MDmeow release build ==="
    Write-Host "Version: $version"
    Write-Host "Artifacts:"
    Get-ChildItem -LiteralPath $ReleaseDir -File | Sort-Object Name | ForEach-Object {
        $hash = Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256
        Write-Host ("  {0}  {1} bytes" -f $_.Name, $_.Length)
        Write-Host ("    SHA256 {0}" -f $hash.Hash)
    }
    Write-Host "Result: PASS (exactly two release artifacts)"
}
catch {
    Remove-IfExists $StageDir
    Remove-IfExists $ReleaseDir
    Write-Error $_
    exit 1
}
finally {
    Pop-Location
}
