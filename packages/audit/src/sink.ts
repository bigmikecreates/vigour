import type { AuditEvent } from "./event.js";

/** Where audit events go. Swap the implementation for Postgres in production. */
export interface AuditSink {
  record(event: AuditEvent): Promise<void>;
}

/** Emits one structured JSON line per event — good for local dev / log shipping. */
export class ConsoleAuditSink implements AuditSink {
  async record(event: AuditEvent): Promise<void> {
    console.log(JSON.stringify({ kind: "audit", ...event }));
  }
}

/** Keeps events in memory — useful for tests. */
export class InMemoryAuditSink implements AuditSink {
  readonly events: AuditEvent[] = [];
  async record(event: AuditEvent): Promise<void> {
    this.events.push(event);
  }
}
