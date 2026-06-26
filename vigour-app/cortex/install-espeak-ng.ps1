<#
.SYNOPSIS
    Downloads and installs espeak-ng (Windows x64) and adds it to the system PATH.
    Required by Kokoro TTS for grapheme-to-phoneme conversion.
    Automatically requests elevation via UAC if not already running as administrator.
.EXAMPLE
    .\install-espeak-ng.ps1
#>

$ErrorActionPreference = 'Stop'

# Auto-elevate via UAC if needed
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Elevation required - requesting UAC prompt..."
    Start-Process pwsh -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}

# 1. Already installed?
if (Get-Command espeak-ng -ErrorAction SilentlyContinue) {
    Write-Host "espeak-ng already on PATH: $((Get-Command espeak-ng).Source)"
    espeak-ng --version
    exit 0
}

# 2. Fetch latest release asset from GitHub
Write-Host "Fetching latest espeak-ng release info from GitHub..."
$release = Invoke-RestMethod 'https://api.github.com/repos/espeak-ng/espeak-ng/releases/latest'
Write-Host "Latest release: $($release.tag_name)"

# Prefer 64-bit MSI; fall back to any MSI
$asset = $release.assets | Where-Object { $_.name -match 'x64\.msi$' } | Select-Object -First 1
if (-not $asset) {
    $asset = $release.assets | Where-Object { $_.name -match '\.msi$' } | Select-Object -First 1
}
if (-not $asset) {
    Write-Error "No MSI installer found among release assets. Check: https://github.com/espeak-ng/espeak-ng/releases"
    exit 1
}

Write-Host "Asset: $($asset.name)  ($([math]::Round($asset.size / 1MB, 1)) MB)"

# 3. Download
$msiPath = Join-Path $env:TEMP $asset.name
Write-Host "Downloading to $msiPath ..."
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $msiPath -UseBasicParsing
Write-Host "Download complete."

# 4. Silent install
Write-Host "Installing silently (msiexec)..."
$proc = Start-Process msiexec -ArgumentList "/i `"$msiPath`" /quiet /norestart" -Wait -PassThru

# 0 = success, 3010 = success but reboot recommended
if ($proc.ExitCode -notin 0, 3010) {
    Write-Error "msiexec failed with exit code $($proc.ExitCode)."
    exit 1
}
if ($proc.ExitCode -eq 3010) {
    Write-Host "(A reboot is recommended but not required for espeak-ng to function.)"
}

# 5. Locate install directory
$candidates = @(
    'C:\Program Files\eSpeak NG',
    'C:\Program Files (x86)\eSpeak NG'
)
$installDir = $candidates | Where-Object { Test-Path (Join-Path $_ 'espeak-ng.exe') } | Select-Object -First 1

if (-not $installDir) {
    # Fallback: check MSI Uninstall registry keys (fast, no filesystem walk)
    $regRoots = @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )
    $regEntry = Get-ItemProperty $regRoots -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -match 'eSpeak' } |
        Select-Object -First 1
    if ($regEntry -and $regEntry.InstallLocation) {
        $installDir = $regEntry.InstallLocation.TrimEnd('\')
    }
}

if (-not $installDir) {
    Write-Warning "Could not locate espeak-ng.exe after install. Add its directory to PATH manually."
    Remove-Item $msiPath -Force -ErrorAction SilentlyContinue
    exit 0
}

Write-Host "Installed at: $installDir"

# 6. Add to system PATH (persistent)
$machinePath = [Environment]::GetEnvironmentVariable('PATH', 'Machine')
if ($machinePath -notlike "*$installDir*") {
    Write-Host "Adding to system PATH..."
    [Environment]::SetEnvironmentVariable('PATH', "$machinePath;$installDir", 'Machine')
} else {
    Write-Host "Already in system PATH."
}

# Update the current session so we can verify immediately
$env:PATH += ";$installDir"

# 7. Verify
Write-Host ""
if (Get-Command espeak-ng -ErrorAction SilentlyContinue) {
    Write-Host "espeak-ng installed successfully:"
    espeak-ng --version
} else {
    Write-Host "Installed to $installDir."
    Write-Host "Restart your terminal (or open a new one) to pick up the updated PATH."
}

Remove-Item $msiPath -Force
Write-Host "Done."
