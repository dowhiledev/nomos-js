import { describe, it, expect } from 'vitest';
import { Agent } from '../src/core/agent';
import { createAgentServer } from '../src/server/core';
import { InMemorySessionStore } from '../src/server/sessions';
import type { LLMBase } from '../src/llms';

class DummyLLM implements LLMBase {
  async generateObject() { return { action: 'RESPOND', response: 'ok' }; }
  async generateText() { return 'ok'; }
  async embedText() { return [0]; }
  async embedBatch() { return [[0]]; }
  streamText(): AsyncIterable<string> { async function* g(){} return g(); }
  async streamObject(): Promise<any> { return { partialStream: (async function* g(){})(), final: Promise.resolve({ action: 'RESPOND', response: 'ok' }) }; }
}

describe('Server sessions manager', () => {
  it('loads/saves state via store using sessionId', async () => {
    const steps: any = [
      { step_id: 'start', description: 'start', routes: [], available_tools: [] },
    ];
    const agent = new Agent({ name: 't', steps, startStepId: 'start', llm: new DummyLLM() as any });
    const store = new InMemorySessionStore();
    const server = createAgentServer(agent, { sessions: { store, autoPersist: true } });

    const sid = 'sess1';
    // First call: no state provided but sessionId present; server should create and then persist
    const out1 = await server.handleNext({ userInput: 'hi', sessionId: sid, persist: true });
    expect(out1.state.session_id).toBeDefined();
    // State must be saved in store
    const loaded = await store.load(out1.state.session_id);
    expect(loaded?.current_step_id).toBe('start');

    // Second call: provide only sessionId, server should load state and respond
    const out2 = await server.handleNext({ userInput: 'hi again', sessionId: sid, persist: true });
    expect(out2.state.session_id).toBe(out1.state.session_id);
  });
});

