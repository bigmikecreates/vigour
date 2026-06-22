<#
.SYNOPSIS
  One-shot MCP smoke test: init session then call tools/list and tools/call.
.PARAMETER McpUrl
  MCP server URL (default: http://localhost:3002).
.PARAMETER View
  Output format: "raw" (full SSE) or "neat" (boxed, default).
.EXAMPLE
  .\mcp-test.ps1
  .\mcp-test.ps1 -View raw
#>

param(
  [string]$McpUrl = "http://localhost:3002",

  [ValidateSet("raw", "neat")]
  [string]$View = "neat"
)

$root = Split-Path -Parent $PSCommandPath

Write-Host "=== MCP Smoke Test ===" -ForegroundColor Magenta
Write-Host ""

& "$root\mcp-init.ps1" -McpUrl $McpUrl
if ($LASTEXITCODE -ne 0) { exit 1 }

& "$root\mcp-call.ps1" -Method "tools/list" -McpUrl $McpUrl -View $View

& "$root\mcp-call.ps1" -Method "tools/call" -Arguments @{
  name      = "query_system"
  arguments = @{ query = "what time is it" }
} -Id 3 -McpUrl $McpUrl -View $View

Write-Host "`n=== Smoke test complete ===" -ForegroundColor Green
