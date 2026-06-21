import http from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { WebClient } from "@slack/web-api";
import type { LlmProvider } from "@vigour/llm";
import type { VigourAction, VigourActionType } from "@vigour/actions";
import { getActionMetadata } from "@vigour/actions";
import { executeAction, type ExecuteContext } from "./execute.js";

interface ToolDefinition {
  name: VigourActionType;
  description: string;
  inputSchema: Record<string, unknown>;
}

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "summarize_unread",
    description: getActionMetadata("summarize_unread").description,
    inputSchema: {
      type: "object",
      properties: {
        channelId: { type: "string", description: "Channel ID or name (optional — all channels if omitted)" },
      },
    },
  },
  {
    name: "read_mentions",
    description: getActionMetadata("read_mentions").description,
    inputSchema: {
      type: "object",
      properties: {
        since: { type: "string", description: "ISO date string to look back from (optional — defaults to 24h)" },
      },
    },
  },
  {
    name: "draft_reply",
    description: getActionMetadata("draft_reply").description,
    inputSchema: {
      type: "object",
      properties: {
        channelId: { type: "string", description: "Channel ID" },
        threadTs: { type: "string", description: "Thread timestamp to reply to" },
        text: { type: "string", description: "Content of the draft reply" },
      },
      required: ["channelId", "threadTs", "text"],
    },
  },
  {
    name: "send_message",
    description: getActionMetadata("send_message").description,
    inputSchema: {
      type: "object",
      properties: {
        channelId: { type: "string", description: "Channel ID to send to" },
        text: { type: "string", description: "Message content" },
      },
      required: ["channelId", "text"],
    },
  },
  {
    name: "broadcast_message",
    description: getActionMetadata("broadcast_message").description,
    inputSchema: {
      type: "object",
      properties: {
        channelIds: { type: "array", items: { type: "string" }, description: "Channel IDs to broadcast to" },
        text: { type: "string", description: "Message content" },
      },
      required: ["channelIds", "text"],
    },
  },
  {
    name: "query_system",
    description: getActionMetadata("query_system").description,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Query about the system (time, date, or anything else)" },
      },
      required: ["query"],
    },
  },
  {
    name: "read_file",
    description: getActionMetadata("read_file").description,
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute filesystem path to read" },
      },
      required: ["path"],
    },
  },
  {
    name: "list_directory",
    description: getActionMetadata("list_directory").description,
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute filesystem path to list" },
      },
      required: ["path"],
    },
  },
  {
    name: "search_files",
    description: getActionMetadata("search_files").description,
    inputSchema: {
      type: "object",
      properties: {
        directory: { type: "string", description: "Directory to search in" },
        pattern: { type: "string", description: "File name pattern (e.g. *.ts)" },
      },
      required: ["directory", "pattern"],
    },
  },
  {
    name: "unrecognized",
    description: getActionMetadata("unrecognized").description,
    inputSchema: {
      type: "object",
      properties: {
        originalQuery: { type: "string", description: "The original unrecognised query text" },
      },
      required: ["originalQuery"],
    },
  },
];

function argsToAction(name: string, args: Record<string, unknown>): VigourAction {
  switch (name) {
    case "summarize_unread":
      return { type: "summarize_unread", channelId: args.channelId as string | undefined };
    case "read_mentions":
      return { type: "read_mentions", since: args.since as string | undefined };
    case "draft_reply":
      return { type: "draft_reply", channelId: args.channelId as string, threadTs: args.threadTs as string, text: args.text as string };
    case "send_message":
      return { type: "send_message", channelId: args.channelId as string, text: args.text as string };
    case "broadcast_message":
      return { type: "broadcast_message", channelIds: args.channelIds as string[], text: args.text as string };
    case "query_system":
      return { type: "query_system", query: args.query as string };
    case "read_file":
      return { type: "read_file", path: args.path as string };
    case "list_directory":
      return { type: "list_directory", path: args.path as string };
    case "search_files":
      return { type: "search_files", directory: args.directory as string, pattern: args.pattern as string };
    case "unrecognized":
      return { type: "unrecognized", originalQuery: args.originalQuery as string };
    default:
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }
}

export interface McpServerDeps {
  client: WebClient;
  userClients: Map<string, WebClient>;
  llm: LlmProvider | null;
  userId?: string;
}

export function startMcpServer(port: number, deps: McpServerDeps): http.Server {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });

  const server = new Server(
    { name: "vigour-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (!args || typeof args !== "object") {
      throw new McpError(ErrorCode.InvalidParams, "Missing tool arguments");
    }

    const action = argsToAction(name, args as Record<string, unknown>);

    const ctx: ExecuteContext = {
      client: deps.client,
      userClient: deps.userClients.get(deps.userId ?? "") ?? null,
      llm: deps.llm,
      userId: deps.userId ?? "",
    };

    try {
      const result = await executeAction(action, ctx);
      const textParts: string[] = [];
      if (result.output) textParts.push(result.output);
      if (result.errorMessage) textParts.push(`Error: ${result.errorMessage}`);
      const text = textParts.join("\n") || (result.status === "executed" ? "Done." : "Failed.");

      return {
        content: [{ type: "text" as const, text }],
        isError: result.status === "failed",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new McpError(ErrorCode.InternalError, message);
    }
  });

  server.connect(transport);
  transport.start();

  const httpServer = http.createServer(async (req, res) => {
    if (req.method === "POST" || req.method === "GET") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        let parsedBody: unknown | undefined;
        if (body) {
          try {
            parsedBody = JSON.parse(body);
          } catch {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid JSON" }));
            return;
          }
        }
        await transport.handleRequest(req, res, parsedBody);
      });
    } else {
      res.writeHead(405);
      res.end();
    }
  });

  httpServer.listen(port, () => {
    console.log(`Vigour MCP server running on :${port}`);
  });

  return httpServer;
}
