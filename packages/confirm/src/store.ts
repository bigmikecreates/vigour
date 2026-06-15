import type { ConfirmationStore, PendingConfirmation } from "./types.js";

export class InMemoryConfirmationStore implements ConfirmationStore {
  private readonly map = new Map<string, PendingConfirmation>();

  async put(p: PendingConfirmation): Promise<void> {
    this.map.set(p.id, p);
  }
  async get(id: string): Promise<PendingConfirmation | undefined> {
    return this.map.get(id);
  }
  async delete(id: string): Promise<void> {
    this.map.delete(id);
  }
  async list(): Promise<PendingConfirmation[]> {
    return [...this.map.values()];
  }
}
