import { randomUUID } from "node:crypto";
import type {
  ConfirmationRequestInput,
  ConfirmationStore,
  PendingConfirmation,
  ResolveResult,
} from "./types.js";
import { renderReadBack } from "./readback.js";
import { genChallenge } from "./challenge.js";

export interface ConfirmationManagerOptions {
  /** How long a pending confirmation stays valid (default 2 min). */
  ttlMs?: number;
  /** Injectable clock + challenge generator for deterministic testing. */
  now?: () => number;
  genChallenge?: () => string;
}

/**
 * Transport-agnostic confirmation lifecycle. It does not know about Slack
 * buttons or voice — it tracks pending confirmations and resolves them by id.
 * The same manager drives Slack today and the visual/voice layers later.
 */
export class ConfirmationManager {
  constructor(
    private readonly store: ConfirmationStore,
    private readonly opts: ConfirmationManagerOptions = {},
  ) {}

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  async request(input: ConfirmationRequestInput): Promise<PendingConfirmation> {
    const now = this.now();
    const ttl = this.opts.ttlMs ?? 120_000;
    const gen = this.opts.genChallenge ?? genChallenge;

    const pending: PendingConfirmation = {
      id: randomUUID(),
      sessionId: input.sessionId,
      userId: input.userId,
      action: input.action,
      level: input.level,
      readBack: input.readBack ?? renderReadBack(input.action),
      challenge: input.level === "elevated" ? gen() : undefined,
      createdAt: now,
      expiresAt: now + ttl,
      data: input.data,
    };
    await this.store.put(pending);
    return pending;
  }

  /** Fetch a still-valid pending confirmation (expires lazily). */
  async get(id: string): Promise<PendingConfirmation | undefined> {
    const p = await this.store.get(id);
    if (!p) return undefined;
    if (this.now() > p.expiresAt) {
      await this.store.delete(id);
      return undefined;
    }
    return p;
  }

  /** Attach/replace the opaque app payload (e.g. transport coordinates). */
  async setData(id: string, data: unknown): Promise<void> {
    const p = await this.store.get(id);
    if (p) {
      p.data = data;
      await this.store.put(p);
    }
  }

  async approve(id: string, opts?: { challengeResponse?: string }): Promise<ResolveResult> {
    const p = await this.store.get(id);
    if (!p) return { ok: false, status: "not_found" };
    if (this.now() > p.expiresAt) {
      await this.store.delete(id);
      return { ok: false, status: "expired", pending: p };
    }
    if (p.level === "elevated") {
      const given = (opts?.challengeResponse ?? "").trim().toUpperCase();
      if (!p.challenge || given !== p.challenge.toUpperCase()) {
        return { ok: false, status: "challenge_failed", pending: p };
      }
    }
    await this.store.delete(id);
    return { ok: true, status: "approved", pending: p };
  }

  async reject(id: string): Promise<ResolveResult> {
    const p = await this.store.get(id);
    if (!p) return { ok: false, status: "not_found" };
    await this.store.delete(id);
    return { ok: false, status: "rejected", pending: p };
  }

  /** Remove and return confirmations that have passed their TTL. */
  async sweepExpired(): Promise<PendingConfirmation[]> {
    const now = this.now();
    const all = await this.store.list();
    const expired = all.filter((p) => now > p.expiresAt);
    for (const p of expired) await this.store.delete(p.id);
    return expired;
  }
}
