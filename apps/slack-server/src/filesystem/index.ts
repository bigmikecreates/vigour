import { readFile as fsReadFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { ExecutionResult } from "../execute.js";

function safePathCheck(p: string): ExecutionResult | null {
  if (p.includes("..")) {
    return { status: "failed", errorMessage: "Path traversal not allowed." };
  }
  return null;
}

export async function readFileAction(filePath: string): Promise<ExecutionResult> {
  const guard = safePathCheck(filePath);
  if (guard) return guard;
  const content = await fsReadFile(filePath, "utf-8");
  const preview = content.length > 2000 ? content.slice(0, 2000) + "\n… (truncated)" : content;
  return { status: "executed", output: "```\n" + preview + "\n```" };
}

export async function listDirectory(dirPath: string): Promise<ExecutionResult> {
  const guard = safePathCheck(dirPath);
  if (guard) return guard;
  const entries = await readdir(dirPath, { withFileTypes: true });
  const lines = entries.map((e) => (e.isDirectory() ? `📁 ${e.name}/` : `📄 ${e.name}`));
  return { status: "executed", output: lines.join("\n") || "Empty directory." };
}

export async function searchFiles(directory: string, pattern: string): Promise<ExecutionResult> {
  const guard = safePathCheck(directory);
  if (guard) return guard;
  const regex = new RegExp(pattern.replace(/\*/g, ".*").replace(/\?/g, "."), "i");
  const entries = await readdir(directory, { withFileTypes: true });
  const matches = entries.filter((e) => regex.test(e.name)).map((e) => join(directory, e.name));
  return {
    status: "executed",
    output: matches.length ? matches.join("\n") : `No files matching "${pattern}" in ${directory}.`,
  };
}
