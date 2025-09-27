import type { Message, Summary, StepIdentifier, Event } from '../models/schemas';

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

  async persist(sessionId: string) {
    if (this.adapter) await this.adapter.save(sessionId, this.items);
  }

  async restore(sessionId: string) {
    if (this.adapter) this.items = await this.adapter.load(sessionId);
  }

  private summarize() {
    // naive summarization: collapse first half of messages into one summary
    const messages = this.items.filter(i => (i as any).role) as Message[];
    if (messages.length < 2) return;
    const keep = this.items.slice(-Math.floor(this.summarizeEvery / 2));
    const summary = messages.slice(0, Math.floor(messages.length / 2)).map(m => `${m.role}: ${m.content}`);
    this.items = [...keep, { summary, timestamp: new Date() } as Summary];
  }
}

