<#
.SYNOPSIS
  Kills the process holding one or more ports.
.PARAMETER Port
  Port number(s) to free.
.PARAMETER Force
  Skip confirmation prompt.
.EXAMPLE
  kill-port 1420
  kill-port 1420 -Force
  kill-port 3000,3001,3002 -Force
#>

param(
  [Parameter(Mandatory, ValueFromRemainingArguments)]
  [int[]]$Port,

  [switch]$Force
)

$foundAny = $false

foreach ($p in $Port) {
  $procId = $null
  $procName = $null

  try {
    $conn = Get-NetTCPConnection -LocalPort $p -ErrorAction Stop
    $procId = $conn.OwningProcess
    $procName = (Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName
  } catch {
    # fallback to netstat parsing
    $line = netstat -ano | Select-String ":$p\s" | Select-Object -First 1
    if ($line) {
      $parts = ($line -split '\s+') | Where-Object { $_ -ne '' }
      $procId = $parts[-1]
      $procName = (Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName
    }
  }

  if (-not $procId) {
    Write-Host "[$p] nothing listening" -ForegroundColor Yellow
    continue
  }
  $foundAny = $true

  if (-not $Force) {
    $confirm = Read-Host "[$p] kill $procName (PID $procId)? [y/N]"
    if ($confirm -ne "y" -and $confirm -ne "Y") {
      Write-Host "[$p] skipped" -ForegroundColor Yellow
      continue
    }
  } else {
    Write-Host "[$p] killing $procName (PID $procId)..." -ForegroundColor Cyan
  }

  try {
    Stop-Process -Id $procId -Force
    Write-Host "[$p] killed $procName" -ForegroundColor Green
  } catch {
    Write-Host "[$p] failed: $_" -ForegroundColor Red
  }
}

if (-not $foundAny) {
  Write-Host "No processes found on the given port(s)." -ForegroundColor Yellow
}
