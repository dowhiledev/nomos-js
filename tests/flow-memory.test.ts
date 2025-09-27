import { describe, it, expect } from 'vitest';
import { Agent } from '../src/index';
import type { LLMBase } from '../src/llms';

class QueueLLM implements LLMBase {
  private q: any[];
  constructor(q: any[]) {
    this.q = q;
  }
  async generateObject() {
    return this.q.shift();
  }
  async generateText() {
    return JSON.stringify(this.q.shift());
  }
  async embedText() {
    return [0];
  }
  async embedBatch() {
    return [[0]];
  }
  streamText(): AsyncIterable<string> {
    async function* g() {}
    return g();
  }
  async streamObject(): Promise<any> {
    return { partialStream: (async function* g() {})(), final: Promise.resolve(this.q.shift()) };
  }
}

describe('Flow memory integration', () => {
  it('records flow enter/exit in state.flow_state', async () => {
    const steps = [
      {
        step_id: 'start',
        description: 'start',
        routes: [{ target: 'flow_entry', condition: 'go' }],
        available_tools: [],
      },
      {
        step_id: 'flow_entry',
        description: 'in flow',
        routes: [{ target: 'inside', condition: 'go' }],
        available_tools: [],
        flow_id: 'myflow',
      },
      {
        step_id: 'inside',
        description: 'inside',
        routes: [{ target: 'end', condition: 'exit' }],
        available_tools: [],
        flow_id: 'myflow',
      },
      { step_id: 'end', description: 'end', routes: [] },
    ] as any;

    const llm = new QueueLLM([
      { action: 'MOVE', step_id: 'flow_entry' },
      { action: 'MOVE', step_id: 'inside' },
      { action: 'MOVE', step_id: 'end' },
    ]) as any;

    const agent = new Agent({ name: 'flow_mem', steps, startStepId: 'start', tools: [], llm });

    let res = await agent.next('go', undefined, false, false, true);
    expect(res.state.flow_state?.flow_context.flow_id).toBe('myflow');
    const entry = res.state.flow_state?.flow_context.entry_step;
    expect(entry).toBe('flow_entry');

    res = await agent.next(undefined, res.state, false, false, true);
    expect(res.state.flow_state?.flow_context.current_step_id).toBe('inside');

    res = await agent.next(undefined, res.state, false, false, true);
    expect(res.state.flow_state).toBeUndefined(); // exited flow
  });
});
