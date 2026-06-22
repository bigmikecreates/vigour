<#
.SYNOPSIS
  Initializes an MCP session with the Vigour MCP server (Streamable HTTP).
.DESCRIPTION
  Sends the initialize handshake, stores the session ID, and sends the initialized
  notification.  Subsequent calls to mcp-call.ps1 will use the stored session ID.
.PARAMETER McpUrl
  MCP server URL (default: http://localhost:3002).
.EXAMPLE
  .\mcp-init.ps1
  .\mcp-init.ps1 -McpUrl http://localhost:9999
#>

param(
  [string]$McpUrl = "http://localhost:3002"
)

$store = "$env:TEMP\vigour-mcp-session.txt"

$headers = @{
  Accept = "application/json, text/event-stream"
}
$initBody = @{
  jsonrpc = "2.0"
  id      = 1
  method  = "initialize"
  params  = @{
    protocolVersion = "2025-03-26"
    capabilities    = @{}
    clientInfo      = @{ name = "vigour-cli"; version = "1.0.0" }
  }
} | ConvertTo-Json -Compress

Write-Host "Initializing MCP session at $McpUrl ..." -ForegroundColor Cyan
try {
  $resp = Invoke-WebRequest -UseBasicParsing -Uri $McpUrl -Method Post -Body $initBody `
    -ContentType "application/json" -Headers $headers

  $sessionId = $resp.Headers["mcp-session-id"]
  if (-not $sessionId) {
    Write-Host "FAILED: No Mcp-Session-Id in response headers." -ForegroundColor Red
    Write-Host "Response body: $($resp.Content)" -ForegroundColor DarkYellow
    exit 1
  }

  "$sessionId" | Set-Content -Path $store -NoNewline
  Write-Host "Session ID: $sessionId" -ForegroundColor Green

  # Send initialized notification
  $notifyHeaders = @{
    Accept         = "application/json, text/event-stream"
    "Mcp-Session-Id" = $sessionId
  }
  $notifyBody = @{ jsonrpc = "2.0"; method = "notifications/initialized" } |
    ConvertTo-Json -Compress

  try {
    $null = Invoke-WebRequest -UseBasicParsing -Uri $McpUrl -Method Post -Body $notifyBody `
      -ContentType "application/json" -Headers $notifyHeaders -ErrorAction SilentlyContinue
  } catch {
    # 202 Accepted is expected; anything else is fine too
  }

  Write-Host "Session initialized and ready." -ForegroundColor Green
} catch {
  $errMsg = "$_"
  if (($errMsg -like "*already initialized*") -and (Test-Path $store)) {
    $sessionId = Get-Content $store -Raw | ForEach-Object { $_.Trim() }
    Write-Host ("Session already active (ID: $sessionId) - reusing it.") -ForegroundColor Yellow
  } else {
    Write-Host ("FAILED: $errMsg") -ForegroundColor Red
    exit 1
  }
}
