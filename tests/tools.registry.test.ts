import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { Agent } from '../src/core/agent';
import { ToolRegistry, createTool, applyRegistryToAgent, registerAgentTools } from '../src/tools';
import { OpenAILLM } from '../src/llms';

function makeAgentWithNoTools() {
  const steps = [
    { step_id: 'start', description: 'start', routes: [], available_tools: [] },
  ];
  const llm = new OpenAILLM({ provider: 'openai', model: 'gpt-4', apiKey: 'test' } as any);
  return new Agent({ name: 't', steps, startStepId: 'start', llm });
}

describe('ToolRegistry sync helpers', () => {
  it('applies registry tools to agent and back', async () => {
    const registry = new ToolRegistry();
    const echo = createTool('echo', 'Echo input', z.object({ text: z.string() }), async ({ text }) => text);
    const add = createTool('add', 'Add numbers', z.object({ a: z.number(), b: z.number() }), async ({ a, b }) => a + b);
    registry.register(echo, 'ns1');
    registry.register(add, 'ns2');

    const agent = makeAgentWithNoTools();
    // apply only ns1
    const added = applyRegistryToAgent(agent, registry, 'ns1');
    expect(added).toBe(1);
    expect(agent.getTools().map(t => t.name)).toContain('echo');
    expect(agent.getTools().map(t => t.name)).not.toContain('add');

    // register agent tools into another registry namespace
    const reg2 = new ToolRegistry();
    const count = registerAgentTools(agent, reg2, 'mirror');
    expect(count).toBe(1);
    expect(reg2.has('echo', 'mirror')).toBe(true);
  });

  it('serializes and restores registry', () => {
    const registry = new ToolRegistry();
    const tool = createTool('t1', 'T1', z.object({}), async () => 'ok');
    registry.register(tool, 'x');
    const json = registry.toJSON();
    expect(json.find(i => i.name === 't1' && i.namespace === 'x')).toBeTruthy();

    const restored = ToolRegistry.fromJSON(json, { t1: tool });
    expect(restored.has('t1', 'x')).toBe(true);
  });
});

