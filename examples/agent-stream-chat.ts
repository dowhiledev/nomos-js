import { Agent, OpenAILLM } from '../src/index';
import fs from 'fs';

// Load .env.local
try {
  if (!process.env.OPENAI_API_KEY && fs.existsSync('.env.local')) {
    const content = fs.readFileSync('.env.local', 'utf8');
    for (const line of content.split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m) {
        const key = m[1];
        let val = m[2];
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith('\'') && val.endsWith('\''))) {
          val = val.slice(1, -1);
        }
        process.env[key] = process.env[key] ?? val;
      }
    }
  }
} catch {}

async function main() {
  const llm = new OpenAILLM({ provider: 'openai', model: 'gpt-4o-mini', apiKey: process.env.OPENAI_API_KEY });

  // Minimal agent for demo
  const agent = new Agent({
    name: 'streaming_demo',
    steps: [
      {
        step_id: 'chat',
        description: 'General helpful chat assistant.',
        routes: [],
        available_tools: [],
      },
    ],
    startStepId: 'chat',
    llm,
  });

  const userInput = 'Write a detailed, 8-10 sentence explanation of the Node.js event loop, streaming your answer as you generate it.';
  const stream = agent.streamNext(userInput, undefined, false, false, true, { actions: ['RESPOND'] });
  process.stdout.write('Decision stream:\n');
  for await (const update of stream) {
    if (update.type === 'partial' && update.decision) {
      process.stdout.write(`partial: ${JSON.stringify(update.decision)}\n`);
    } else if (update.type === 'final' && update.response) {
      process.stdout.write(`final response: ${JSON.stringify(update.response)}\n`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
