import type { Message, Summary, StepIdentifier, Event, State } from '../models/schemas';

export type MemoryItem = Message | Summary | StepIdentifier | Event;

export interface MemoryAdapter {
  save(sessionId: string, items: MemoryItem[]): Promise<void>;
  load(sessionId: string): Promise<MemoryItem[]>;
}

export class InMemoryAdapter implements MemoryAdapter {
  private store = new Map<string, MemoryItem[]>();
  async save(sessionId: string, items: MemoryItem[]): Promise<void> {
    this.store.set(sessionId, items);
  }
  async load(sessionId: string): Promise<MemoryItem[]> {
    return this.store.get(sessionId) || [];
  }
}

export class Memory {
  private items: MemoryItem[] = [];
  private adapter?: MemoryAdapter;
  private summarizeEvery: number;
  private flowStore: Map<string, MemoryItem[]> = new Map();
  private flowCtx: Map<
    string,
    {
      entry_step?: string;
      entry_time?: string;
      metadata: Record<string, any>;
      variables: Record<string, any>;
    }
  > = new Map();

  constructor(initial?: MemoryItem[], opts?: { adapter?: MemoryAdapter; summarizeEvery?: number }) {
    if (initial && initial.length) this.items = [...initial];
    this.adapter = opts?.adapter;
    this.summarizeEvery = opts?.summarizeEvery ?? 0;
  }

  add(item: MemoryItem) {
    this.items.push(item);
    if (this.summarizeEvery > 0 && this.items.length > this.summarizeEvery) {
      this.summarize();
    }
  }

  addMessage(role: Message['role'], content: string) {
    this.add({ role, content, timestamp: new Date() });
  }

  addEvent(type: string, content: string, decision?: any) {
    this.add({ type, content, decision, timestamp: new Date() } as Event);
  }

  addStep(step_id: string) {
    this.add({ step_id } as StepIdentifier);
  }

  addSummary(lines: string[]) {
    this.add({ summary: lines, timestamp: new Date() });
  }

  getHistory(): MemoryItem[] {
    return this.items;
  }

  addFlowEvent(flowId: string, type: string, content: string, decision?: any) {
    const list = this.flowStore.get(flowId) || [];
    list.push({ type, content, decision, timestamp: new Date() } as Event);
    this.flowStore.set(flowId, list);
  }

  addFlowStep(flowId: string, step_id: string) {
    const list = this.flowStore.get(flowId) || [];
    list.push({ step_id } as StepIdentifier);
    this.flowStore.set(flowId, list);
  }

  getFlowHistory(flowId: string): MemoryItem[] {
    return this.flowStore.get(flowId) || [];
  }

  setFlowContext(
    flowId: string,
    ctx: {
      entry_step?: string;
      entry_time?: string;
      metadata?: Record<string, any>;
      variables?: Record<string, any>;
    },
  ) {
    const prev = this.flowCtx.get(flowId) || { metadata: {}, variables: {} };
    this.flowCtx.set(flowId, {
      entry_step: ctx.entry_step ?? prev.entry_step,
      entry_time: ctx.entry_time ?? prev.entry_time,
      metadata: { ...prev.metadata, ...(ctx.metadata || {}) },
      variables: { ...prev.variables, ...(ctx.variables || {}) },
    });
  }

  getFlowContext(flowId: string):
    | {
        entry_step?: string;
        entry_time?: string;
        metadata: Record<string, any>;
        variables: Record<string, any>;
      }
    | undefined {
    return this.flowCtx.get(flowId);
  }

  async persist(sessionId: string) {
    if (this.adapter) await this.adapter.save(sessionId, this.items);
  }

  async restore(sessionId: string) {
    if (this.adapter) this.items = await this.adapter.load(sessionId);
  }

  private summarize() {
    // naive summarization: collapse first half of messages into one summary
    const messages = this.items.filter((i) => (i as any).role) as Message[];
    if (messages.length < 2) return;
    const keep = this.items.slice(-Math.floor(this.summarizeEvery / 2));
    const summary = messages
      .slice(0, Math.floor(messages.length / 2))
      .map((m) => `${m.role}: ${m.content}`);
    this.items = [...keep, { summary, timestamp: new Date() } as Summary];
  }
}

// State persistence (full state)
export interface StateAdapter {
  saveState(sessionId: string, state: State): Promise<void>;
  loadState(sessionId: string): Promise<State | null>;
}

export class FsStateAdapter implements StateAdapter {
  private dir: string;
  constructor(dir: string = '.nomos') {
    this.dir = dir;
  }
  async saveState(sessionId: string, state: State): Promise<void> {
    const { promises: fs } = await import('fs');
    const { join } = await import('path');
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(
      join(this.dir, `${sessionId}.state.json`),
      JSON.stringify(state, null, 2),
      'utf8',
    );
  }
  async loadState(sessionId: string): Promise<State | null> {
    try {
      const { promises: fs } = await import('fs');
      const { join } = await import('path');
      const raw = await fs.readFile(join(this.dir, `${sessionId}.state.json`), 'utf8');
      return JSON.parse(raw) as State;
    } catch {
      return null;
    }
  }
}

export class FsAdapter implements MemoryAdapter {
  private dir: string;
  constructor(dir: string = '.nomos') {
    this.dir = dir;
  }
  async save(sessionId: string, items: MemoryItem[]): Promise<void> {
    const { promises: fs } = await import('fs');
    const { join } = await import('path');
    await fs.mkdir(this.dir, { recursive: true });
    const file = join(this.dir, `${sessionId}.json`);
    await fs.writeFile(file, JSON.stringify(items, null, 2), 'utf8');
  }
  async load(sessionId: string): Promise<MemoryItem[]> {
    try {
      const { promises: fs } = await import('fs');
      const { join } = await import('path');
      const file = join(this.dir, `${sessionId}.json`);
      const data = await fs.readFile(file, 'utf8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }
}

export class LocalStorageAdapter implements MemoryAdapter {
  private prefix: string;
  constructor(prefix: string = 'nomos:') {
    this.prefix = prefix;
  }
  async save(sessionId: string, items: MemoryItem[]): Promise<void> {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(this.prefix + sessionId, JSON.stringify(items));
  }
  async load(sessionId: string): Promise<MemoryItem[]> {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(this.prefix + sessionId);
    return raw ? JSON.parse(raw) : [];
  }
}

export class LocalStorageStateAdapter implements StateAdapter {
  private prefix: string;
  constructor(prefix: string = 'nomos:state:') {
    this.prefix = prefix;
  }
  async saveState(sessionId: string, state: State): Promise<void> {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(this.prefix + sessionId, JSON.stringify(state));
  }
  async loadState(sessionId: string): Promise<State | null> {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(this.prefix + sessionId);
    return raw ? (JSON.parse(raw) as State) : null;
  }
}
