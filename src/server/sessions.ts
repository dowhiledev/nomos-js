import { v4 as uuidv4 } from 'uuid';
import type { State } from '../models/schemas';

export interface SessionStore {
  load(sessionId: string): Promise<State | null>;
  save(sessionId: string, state: State): Promise<void>;
  delete?(sessionId: string): Promise<void>;
}

export class InMemorySessionStore implements SessionStore {
  private map = new Map<string, State>();
  async load(sessionId: string): Promise<State | null> {
    return this.map.get(sessionId) || null;
  }
  async save(sessionId: string, state: State): Promise<void> {
    this.map.set(sessionId, state);
  }
  async delete(sessionId: string): Promise<void> {
    this.map.delete(sessionId);
  }
}

export interface SessionsManagerOptions {
  store: SessionStore;
  generateId?: () => string;
  autoPersist?: boolean;
}

export class SessionsManager {
  private store: SessionStore;
  private generate: () => string;
  private autoPersist: boolean;
  constructor(opts: SessionsManagerOptions) {
    this.store = opts.store;
    this.generate = opts.generateId || (() => uuidv4());
    this.autoPersist = !!opts.autoPersist;
  }

  newId(): string { return this.generate(); }

  async resolveState(sessionId?: string, provided?: State): Promise<{ sessionId?: string; state?: State }> {
    if (provided) return { sessionId: provided.session_id, state: provided };
    if (sessionId) {
      const st = await this.store.load(sessionId);
      return { sessionId, state: st || undefined };
    }
    return {};
  }

  async persist(state: State, persist?: boolean) {
    if (persist || this.autoPersist) {
      await this.store.save(state.session_id, state);
    }
  }
}

