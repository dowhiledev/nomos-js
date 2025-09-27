import { describe, it, expect } from 'vitest';
import { Agent, OpenAILLM, createTool } from '../../src/index';
import { z } from 'zod';
import fs from 'fs';

// Ensure OPENAI_API_KEY from .env.local if not present
(() => {
  if (!process.env.OPENAI_API_KEY && fs.existsSync('.env.local')) {
    const content = fs.readFileSync('.env.local', 'utf8');
    for (const line of content.split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m) {
        const key = m[1];
        let val = m[2];
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        process.env[key] = process.env[key] ?? val;
      }
    }
  }
})();

const llm = new OpenAILLM({
  provider: 'openai',
  model: 'gpt-4o-mini',
  apiKey: process.env.OPENAI_API_KEY,
});

// Simple calculator tool
const calculatorTool = createTool(
  'calculate',
  'Evaluate a math expression exactly as provided using JavaScript semantics. Accepts one parameter: expression (string).',
  z.object({ expression: z.string() }),
  async ({ expression }) => {
    try {
      // eslint-disable-next-line no-eval
      const value = eval(expression);
      return { result: value };
    } catch {
      return { error: 'Invalid expression' };
    }
  },
);

describe('OpenAI e2e (live)', () => {
  it('performs TOOL_CALL with calculator and returns result', async () => {
    const agent = new Agent({
      name: 'tool_caller',
      steps: [
        {
          step_id: 'calc',
          description:
            'When the user asks to compute a math expression, always call the calculate tool with the exact expression string. Do not guess.',
          routes: [],
          available_tools: ['calculate'],
        },
      ],
      startStepId: 'calc',
      llm,
      tools: [calculatorTool],
      systemMessage: 'You are a tool-using assistant. Prefer tools when available.',
      persona: 'Be precise and concise.',
    });

    const res = await agent.next('Compute 7*8', undefined, true, false, true, {
      actions: ['TOOL_CALL'],
    });
    expect(res.tool_output).toBeTruthy();
    const out = JSON.parse(String(res.tool_output));
    expect(out.result).toBe(56);
  }, 60000);

  it('moves to end step when constrained to MOVE', async () => {
    const agent = new Agent({
      name: 'mover',
      steps: [
        {
          step_id: 'classify',
          description:
            'For any input, return a JSON decision that MOVES to the end step. Do not respond with text.',
          routes: [{ target: 'end', condition: 'User wants to end or says goodbye' }],
          available_tools: [],
          examples: [
            {
              context: 'User says: goodbye',
              decision: { action: 'MOVE', step_id: 'end' },
            },
          ],
        },
        {
          step_id: 'end',
          description: 'Politely end the conversation.',
          routes: [],
        },
      ],
      startStepId: 'classify',
      llm,
    });

    const res = await agent.next('hello', undefined, false, false, true, { actions: ['MOVE'] });
    expect(res.state.current_step_id === 'end' || res.decision?.action === 'MOVE').toBeTruthy();
  }, 60000);

  it('responds when constrained to RESPOND', async () => {
    const agent = new Agent({
      name: 'responder',
      steps: [
        {
          step_id: 'chat',
          description: 'Answer questions clearly and succinctly.',
          routes: [],
          available_tools: [],
        },
      ],
      startStepId: 'chat',
      llm,
    });

    const res = await agent.next('Briefly define gravity.', undefined, false, false, true, {
      actions: ['RESPOND'],
    });
    expect(res.response && typeof res.response === 'string').toBeTruthy();
    expect(res.decision?.action).toBe('RESPOND');
  }, 60000);

  it('invalid TOOL_CALL triggers RESPOND fallback via validation', async () => {
    const agent = new Agent({
      name: 'invalid_tool',
      steps: [
        {
          step_id: 'toolstep',
          description:
            "Always respond with a JSON decision that calls a tool named 'nonexistent_tool' with any args.",
          routes: [],
          available_tools: [],
        },
      ],
      startStepId: 'toolstep',
      llm,
    });

    const res = await agent.next('do it', undefined, false, false, true, {
      actions: ['TOOL_CALL'],
    });
    // Our validation should detect unavailable tool and retry with RESPOND
    expect(res.decision?.action === 'RESPOND' || typeof res.response === 'string').toBeTruthy();
  }, 60000);

  it('auto_flow step produces a response without user input', async () => {
    const agent = new Agent({
      name: 'autoflow',
      steps: [
        {
          step_id: 'auto',
          description: 'Immediately greet the user and explain capabilities.',
          routes: [],
          available_tools: [],
          auto_flow: true,
        },
      ],
      startStepId: 'auto',
      llm,
    });

    const res = await agent.next();
    expect(typeof res.response === 'string' && res.response.length > 0).toBeTruthy();
  }, 60000);
});
