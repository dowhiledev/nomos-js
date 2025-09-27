import { Agent, OpenAILLM } from '../src/index';
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

  const steps = [
    { step_id: 'start', description: 'Enter the flow when user says start.', routes: [{ target: 'flow_entry', condition: 'User says start' }], available_tools: [] },
    { step_id: 'flow_entry', description: 'You are now inside a flow. Move to inside.', routes: [{ target: 'inside', condition: 'Proceed' }], available_tools: [], flow_id: 'myflow' },
    { step_id: 'inside', description: 'Confirm we are inside, then move to end to exit flow.', routes: [{ target: 'end', condition: 'Exit' }], available_tools: [], flow_id: 'myflow' },
    { step_id: 'end', description: 'End.', routes: [] },
  ];

  const agent = new Agent({ name: 'flow_demo', steps, startStepId: 'start', llm });

  let res = await agent.next('start flow', undefined, false, false, true);
  console.log('Decision:', res.decision);
  let safety = 0;
  while (res.decision && (res.decision.action === 'MOVE' || res.decision.action === 'TOOL_CALL') && safety < 5) {
    res = await agent.next(undefined, res.state, false, false, true);
    console.log('Decision:', res.decision);
    safety++;
  }
  console.log('Final step:', res.state.current_step_id);
  console.log('State history length:', res.state.history.length);
}

main().catch(console.error);
