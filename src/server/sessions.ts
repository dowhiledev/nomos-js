import { v4 as uuidv4 } from 'uuid';
import type { State } from '../models/schemas';

/** Minimal interface for loading and saving full session state objects. */
export interface SessionStore {
  load(sessionId: string): Promise<State | null>;
  save(sessionId: string, state: State): Promise<void>;
  delete?(sessionId: string): Promise<void>;
}

/** In-memory implementation of {@link SessionStore} for development/testing. */
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

/** Options to construct a {@link SessionsManager}. */
export interface SessionsManagerOptions {
  store: SessionStore;
  generateId?: () => string;
  autoPersist?: boolean;
}

/**
 * Helper for resolving and persisting session state for server endpoints.
 */
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

  /** Resolve a state using a provided object or by loading from a store by id. */
  async resolveState(sessionId?: string, provided?: State): Promise<{ sessionId?: string; state?: State }> {
    if (provided) return { sessionId: provided.session_id, state: provided };
    if (sessionId) {
      const st = await this.store.load(sessionId);
      return { sessionId, state: st || undefined };
    }
    return {};
  }

  /** Persist the state if `persist` is true or autoPersist is enabled. */
  async persist(state: State, persist?: boolean) {
    if (persist || this.autoPersist) {
      await this.store.save(state.session_id, state);
    }
  }
}
