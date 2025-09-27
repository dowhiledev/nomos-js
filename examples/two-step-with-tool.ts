import { Agent, OpenAILLM, createTool } from '../src/index';
import { z } from 'zod';
import fs from 'fs';

// Load env
try {
  if (!process.env.OPENAI_API_KEY && fs.existsSync('.env.local')) {
    const c = fs.readFileSync('.env.local', 'utf8');
    for (const line of c.split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m) {
        const key = m[1];
        let val = m[2];
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith('\'') && val.endsWith('\''))) val = val.slice(1, -1);
        process.env[key] = process.env[key] ?? val;
      }
    }
  }
} catch {}

async function main() {
  const llm = new OpenAILLM({ provider: 'openai', model: 'gpt-4o-mini', apiKey: process.env.OPENAI_API_KEY });

  const timeTool = createTool(
    'get_time',
    'Return the current local time string. No parameters.',
    z.object({}),
    async () => ({ time: new Date().toLocaleString() }),
  );

  const steps = [
    {
      step_id: 'start',
      description: 'Greet the user and ask if they want the current time. If yes, MOVE to time step.',
      routes: [{ target: 'time', condition: 'User asks for time' }],
      available_tools: [],
      examples: [
        { context: 'User asks for time', decision: { action: 'MOVE', step_id: 'time' } },
      ],
    },
    {
      step_id: 'time',
      description: 'You MUST call the get_time tool (no args). Do not answer directly. After receiving tool output, RESPOND with the time and then MOVE to end on the next turn.',
      routes: [{ target: 'end', condition: 'After providing time' }],
      available_tools: ['get_time'],
      examples: [
        { context: 'User says: Please tell me the current time', decision: { action: 'TOOL_CALL', tool_call: { tool_name: 'get_time', tool_kwargs: {} } } },
        { context: 'After tool result', decision: { action: 'MOVE', step_id: 'end' } },
      ],
    },
    { step_id: 'end', description: 'End politely.', routes: [] },
  ];

  const agent = new Agent({ name: 'two_step', steps, startStepId: 'start', tools: [timeTool], llm });

  console.log('Start');
  let resp = await agent.next(undefined, undefined, true, false, true);
  console.log('Decision:', resp.decision);
  console.log('Assistant:', resp.response);

  // Ask for current time; first show MOVE transition into the time step
  resp = await agent.next('Please tell me the current time.', resp.state, true, false, true, { actions: ['MOVE'] });
  console.log('Decision:', resp.decision);
  console.log('Assistant:', resp.response);
  if (resp.tool_output) console.log('Tool Output:', resp.tool_output);

  // Now in time step: enforce TOOL_CALL to demonstrate tool execution
  resp = await agent.next('Yes, time please.', resp.state, true, false, true, { actions: ['TOOL_CALL'] });
  console.log('Decision:', resp.decision);
  console.log('Assistant:', resp.response);
  if (resp.tool_output) console.log('Tool Output:', resp.tool_output);

  // Transition to end; constrain to MOVE to show final transition
  resp = await agent.next('Thanks', resp.state, true, false, true, { actions: ['MOVE'] });
  console.log('Decision:', resp.decision);
  console.log('Assistant:', resp.response);
}

main().catch(console.error);
