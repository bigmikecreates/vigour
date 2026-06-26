<#
.SYNOPSIS
    One-time dev environment setup for Vigour on Windows.
    - Adds Windows Defender exclusions for build/temp directories
    - Installs espeak-ng (required by Kokoro TTS)
    Auto-elevates via UAC if not already running as administrator.
.EXAMPLE
    .\setup-dev.ps1
#>

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

# Auto-elevate via UAC if needed
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Elevation required - requesting UAC prompt..."
    Start-Process pwsh -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}

Write-Host "=== Vigour dev setup ==="
Write-Host ""

# 1. Windows Defender exclusions
Write-Host "[1/2] Adding Windows Defender exclusions..."
$exclusions = @(
    $root,                                    # project root (covers all build output)
    "$env:USERPROFILE\.cargo",                # Rust/Cargo toolchain and registry
    $env:TEMP,                                # pip/Meson sanity-check binaries
    "$env:LOCALAPPDATA\Temp"                  # secondary temp used by some build tools
)
foreach ($path in $exclusions) {
    $existing = (Get-MpPreference).ExclusionPath
    if ($existing -contains $path) {
        Write-Host "  Already excluded: $path"
    } else {
        Add-MpPreference -ExclusionPath $path
        Write-Host "  Added: $path"
    }
}
Write-Host ""

# 2. espeak-ng (Kokoro TTS dependency)
Write-Host "[2/2] Checking espeak-ng..."
$esScript = Join-Path $root "vigour-app\cortex\install-espeak-ng.ps1"
if (Get-Command espeak-ng -ErrorAction SilentlyContinue) {
    Write-Host "  Already installed: $((Get-Command espeak-ng).Source)"
} elseif (Test-Path $esScript) {
    Write-Host "  Running install-espeak-ng.ps1..."
    & $esScript
} else {
    Write-Warning "  install-espeak-ng.ps1 not found at $esScript - run it manually."
}

Write-Host ""
Write-Host "=== Setup complete ==="
Write-Host "Next: activate the cortex venv and run 'pip install -r vigour-app\cortex\requirements.txt'"
