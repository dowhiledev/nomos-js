import { Agent, OpenAILLM, createTool, FsAdapter, FsStateAdapter } from '../src/index';
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
  const timeTool = createTool('get_time', 'Return the current local time.', z.object({}), async () => ({ time: new Date().toLocaleString() }));

  const steps = [
    { step_id: 'start', description: 'Greet and ask if user wants time.', routes: [{ target: 'time', condition: 'User asks for time' }], available_tools: [] },
    { step_id: 'time', description: 'Call get_time tool and report it, then end.', routes: [{ target: 'end', condition: 'After providing time' }], available_tools: ['get_time'] },
    { step_id: 'end', description: 'End.', routes: [] },
  ];

  const agent = new Agent({ name: 'persist_demo', steps, startStepId: 'start', tools: [timeTool], llm, memoryAdapter: new FsAdapter('.nomos'), stateAdapter: new FsStateAdapter('.nomos') as any });

  // Phase 1: Start and ask for time
  let res = await agent.next('Please tell me the current time.', undefined, true, false, true);
  console.log('Phase1 Decision:', res.decision);
  if (res.tool_output) console.log('Phase1 Tool Output:', res.tool_output);
  console.log('Phase1 Assistant:', res.response);

  const sessionId = res.state.session_id;
  const currentState = res.state;
  // Save full state via state adapter
  await (new FsStateAdapter('.nomos')).saveState(sessionId, currentState as any);

  // Phase 2: Simulate new process by creating a new agent and restoring from disk
  const stateAdapter = new FsStateAdapter('.nomos');
  const restored = await stateAdapter.loadState(sessionId);
  let res2 = await agent.next(undefined, restored as any, true, false, true);
  console.log('Phase2 Decision:', res2.decision);
  if (res2.tool_output) console.log('Phase2 Tool Output:', res2.tool_output);
  console.log('Phase2 Assistant:', res2.response);
}

main().catch(console.error);
