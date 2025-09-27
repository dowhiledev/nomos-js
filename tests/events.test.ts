import { describe, it, expect } from 'vitest';
import { Agent } from '../src/index';
import type { LLMBase } from '../src/llms';
import { z } from 'zod';

class DummyLLM implements LLMBase {
  async generateText(): Promise<string> { return '{"action":"RESPOND","response":"hi"}'; }
  async embedText(): Promise<number[]> { return [0]; }
  async embedBatch(): Promise<number[][]> { return [[0]]; }
  async generateObject<T>(): Promise<any> { return { action: 'RESPOND', response: 'hi' }; }
  streamText(): AsyncIterable<string> { async function* g(){} return g(); }
  async streamObject(): Promise<any> { return { partialStream: (async function* g(){})(), final: Promise.resolve({ action: 'RESPOND', response: 'hi' }) }; }
}

describe('EventEmitter integration', () => {
  it('emits decision events', async () => {
    const events: any[] = [];
    const emitter = { emit: (e: any) => { events.push(e); } };
    const agent = new Agent({
      name: 'evt',
      steps: [ { step_id: 's', description: 'respond', routes: [], available_tools: [] } as any ],
      startStepId: 's',
      tools: [],
      llm: new DummyLLM() as any,
      eventEmitter: emitter as any,
    });
    const res = await agent.next('hello', undefined, false, false, true);
    expect(res.response).toBe('hi');
    const hasDecision = events.some(e => e.type === 'decision');
    expect(hasDecision).toBeTruthy();
  });
});

