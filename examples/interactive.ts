import { Agent, OpenAILLM, createTool } from '../src/index';
import { z } from 'zod';
import fs from 'fs';
import readline from 'readline';

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
    {
      step_id: 'start',
      description: 'Greet the user. If they ask for time, MOVE to time. Else RESPOND helpfully.',
      routes: [{ target: 'time', condition: 'User asks for time' }],
      available_tools: [],
      examples: [{ context: 'User asks for time', decision: { action: 'MOVE', step_id: 'time' } }],
    },
    {
      step_id: 'time',
      description: 'Call get_time tool and report the time. Then MOVE back to start.',
      routes: [{ target: 'start', condition: 'After providing time' }],
      available_tools: ['get_time'],
      examples: [{ context: 'User asks for time', decision: { action: 'TOOL_CALL', tool_call: { tool_name: 'get_time', tool_kwargs: {} } } }],
    },
  ];

  const agent = new Agent({ name: 'interactive_demo', steps, startStepId: 'start', tools: [timeTool], llm });

  let state: any = undefined;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('Interactive NOMOS demo. Type your message, Ctrl+C to exit.');

  const ask = () => new Promise<string>(resolve => rl.question('You: ', resolve));

  while (true) {
    const input = await ask();
    let res = await agent.next(input, state, true, false, true);
    state = res.state;
    console.log('Decision:', res.decision);
    if (res.tool_output) console.log('Tool Output:', res.tool_output);
    console.log('Assistant:', res.response);

    // Auto-advance on TOOL_CALL or MOVE by sending undefined
    let safety = 0;
    while (res.decision && (res.decision.action === 'TOOL_CALL' || res.decision.action === 'MOVE') && safety < 3) {
      res = await agent.next(undefined, state, true, false, true);
      state = res.state;
      console.log('Decision:', res.decision);
      if (res.tool_output) console.log('Tool Output:', res.tool_output);
      console.log('Assistant:', res.response);
      safety++;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

