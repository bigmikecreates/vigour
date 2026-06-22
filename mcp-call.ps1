<#
.SYNOPSIS
  Calls an MCP tool on the Vigour MCP server using the stored session.
.PARAMETER Method
  MCP method to call, e.g. "tools/list", "tools/call".
.PARAMETER Arguments
  Optional hashtable of arguments (required for tools/call).
.PARAMETER Id
  JSON-RPC request ID (default: 2).
.PARAMETER McpUrl
  MCP server URL (default: http://localhost:3002).
.PARAMETER View
  Output format: "raw" (full SSE) or "neat" (boxed, default).
.EXAMPLE
  .\mcp-call.ps1 -Method tools/list
  .\mcp-call.ps1 -Method tools/call -Arguments @{ name = "query_system"; arguments = @{ query = "time" } } -View raw
#>

param(
  [Parameter(Mandatory)]
  [string]$Method,
  [hashtable]$Arguments = @{},
  [int]$Id = 2,
  [string]$McpUrl = "http://localhost:3002",
  [ValidateSet("raw", "neat")]
  [string]$View = "neat"
)

$store = "$env:TEMP\vigour-mcp-session.txt"
if (-not (Test-Path $store)) {
  Write-Host "No active session. Run .\mcp-init.ps1 first." -ForegroundColor Red
  exit 1
}

$sessionId = (Get-Content $store -Raw).Trim()
$headers = @{
  Accept           = "application/json, text/event-stream"
  "Mcp-Session-Id" = $sessionId
}
$body = @{
  jsonrpc = "2.0"
  id      = $Id
  method  = $Method
  params  = $Arguments
} | ConvertTo-Json -Compress -Depth 5

Write-Host "Calling $Method ..." -ForegroundColor Cyan

try {
  $resp = Invoke-WebRequest -UseBasicParsing -Uri $McpUrl -Method Post -Body $body `
    -ContentType "application/json" -Headers $headers

  $rawSse = $resp.Content

  if ($View -eq "raw") {
    $rawSse
    exit 0
  }

  # Parse SSE data lines into JSON
  $dataLines = @()
  foreach ($line in ($rawSse -split "`n")) {
    if ($line -match "^data: ") {
      $dataLines += $line -replace "^data: ", ""
    }
  }
  $joined = $dataLines -join ""
  $json = $joined | ConvertFrom-Json

  # -- Neat formatting --
  $boxWidth = 80
  try { $boxWidth = $Host.UI.RawUI.WindowSize.Width - 2 } catch {}
  if ($boxWidth -lt 50) { $boxWidth = 50 }

  $hasResult = ($null -ne $json.result)
  $statusIcon = if ($hasResult) { "OK" } else { "FAIL" }
  $statusColor = if ($hasResult) { "Green" } else { "Red" }
  $inner = $boxWidth - 4

  # Top border
  $dashLen = $boxWidth - $Method.Length - 5
  Write-Host ("[-- $Method " + ('-' * [Math]::Max(0, $dashLen)) + "--]")

  if ($Method -eq "tools/list" -and $hasResult) {
    $tools = $json.result.tools
    $line = "$statusIcon $($tools.Count) tools registered"
    Write-Host "| $($line.PadRight($inner)) |" -ForegroundColor $statusColor
    Write-Host "| $(''.PadRight($inner)) |"
    foreach ($t in $tools) {
      $nameLine = "  $($t.name)"
      Write-Host "| $($nameLine.PadRight($inner)) |"
      $remaining = $t.description
      while ($remaining.Length -gt 0) {
        if ($remaining.Length -le ($inner - 2)) {
          Write-Host "| $('    ')$($remaining.PadRight($inner - 4)) |"
          break
        }
        $seg = $remaining.Substring(0, [Math]::Max(1, $inner - 2))
        $sp = $seg.LastIndexOf(' ')
        if ($sp -le 0) { $sp = $inner - 2 }
        $part = $remaining.Substring(0, $sp).TrimEnd()
        Write-Host "| $('    ')$($part.PadRight($inner - 4)) |"
        $remaining = $remaining.Substring($sp).TrimStart()
      }
    }
  } elseif ($Method -match "tools/call" -and $hasResult) {
    $texts = @($json.result.content | Where-Object { $_.type -eq "text" } | ForEach-Object { $_.text })
    if ($texts.Length -gt 0) {
      foreach ($t in $texts) {
        $remaining = $t
        while ($remaining.Length -gt 0) {
          if ($remaining.Length -le $inner) {
            $row = "$statusIcon " + $remaining.PadRight($inner - 2)
            Write-Host "| $row |" -ForegroundColor $statusColor
            break
          }
          $seg = $remaining.Substring(0, [Math]::Max(1, $inner - 2))
          $sp = $seg.LastIndexOf(' ')
          if ($sp -le 0) { $sp = $inner - 2 }
          $part = $remaining.Substring(0, $sp).TrimEnd()
          $row = "$statusIcon " + $part.PadRight($inner - 2)
          Write-Host "| $row |" -ForegroundColor $statusColor
          $remaining = $remaining.Substring($sp).TrimStart()
        }
      }
    } else {
      $row = "$statusIcon " + "Done.".PadRight($inner - 2)
      Write-Host "| $row |" -ForegroundColor $statusColor
    }
  } elseif ($hasResult) {
    $row = "$statusIcon " + "Result".PadRight($inner - 2)
    Write-Host "| $row |" -ForegroundColor $statusColor
  } else {
    $remaining = $json.error.message
    while ($remaining.Length -gt 0) {
      if ($remaining.Length -le $inner) {
        $row = "$statusIcon " + $remaining.PadRight($inner - 2)
        Write-Host "| $row |" -ForegroundColor $statusColor
        break
      }
      $seg = $remaining.Substring(0, [Math]::Max(1, $inner - 2))
      $sp = $seg.LastIndexOf(' ')
      if ($sp -le 0) { $sp = $inner - 2 }
      $part = $remaining.Substring(0, $sp).TrimEnd()
      $row = "$statusIcon " + $part.PadRight($inner - 2)
      Write-Host "| $row |" -ForegroundColor $statusColor
      $remaining = $remaining.Substring($sp).TrimStart()
    }
  }

  # Bottom border
  Write-Host ("[--" + ('-' * ($boxWidth - 2)) + "--]")

} catch {
  Write-Host "FAILED: $_" -ForegroundColor Red
  if ($_.Exception.Response) {
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    $errBody = $reader.ReadToEnd()
    $reader.Close()
    Write-Host "Error body: $errBody" -ForegroundColor DarkYellow
  }
  exit 1
}
