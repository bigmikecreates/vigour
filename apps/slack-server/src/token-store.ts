import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const STORE_PATH = join(process.cwd(), ".tokens.local.json");
export const TOKEN_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

export interface StoredToken {
  accessToken: string;
  grantedScopes: string[];
  expiresAt: number;
}

export type TokenFile = Record<string, StoredToken>;

export async function loadTokens(): Promise<TokenFile> {
  try {
    const raw = await readFile(STORE_PATH, "utf-8");
    const all: TokenFile = JSON.parse(raw);
    const now = Date.now();
    for (const uid of Object.keys(all)) {
      if (all[uid]!.expiresAt <= now) delete all[uid];
    }
    return all;
  } catch {
    return {};
  }
}

export async function saveToken(
  userId: string,
  entry: StoredToken,
  existing: TokenFile,
): Promise<void> {
  const updated: TokenFile = { ...existing, [userId]: entry };
  await writeFile(STORE_PATH, JSON.stringify(updated, null, 2), "utf-8");
}
