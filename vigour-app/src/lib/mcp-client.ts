const MCP_URL = "http://localhost:3002";

export interface McpToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

interface McpRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

let requestId = 0;

async function sendRequest(method: string, params?: unknown): Promise<unknown> {
  const id = ++requestId;
  const body: McpRequest = { jsonrpc: "2.0", id, method, params };

  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`MCP request failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(`MCP error: ${data.error.message ?? JSON.stringify(data.error)}`);
  }

  return data.result;
}

/** List all available tools from the MCP server. */
export async function listTools(): Promise<string[]> {
  const result = await sendRequest("tools/list") as { tools: Array<{ name: string }> };
  return result.tools.map((t) => t.name);
}

/** Call a tool by name with the given arguments. */
export async function callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const result = await sendRequest("tools/call", { name, arguments: args }) as McpToolResult;
  return result;
}
