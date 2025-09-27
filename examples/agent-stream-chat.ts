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

  const session = agent.createSession();

  const userInput = 'Explain event loop in Node.js in 3-4 sentences.';
  const context = (session as any).buildContext ? (session as any).buildContext() : '';

  // Build a simple prompt using agent persona/system
  const prompt = `System: You are a concise assistant.\n\nContext: ${context}\n\nUser: ${userInput}\n\nAssistant:`;

  const stream = await llm.streamText(prompt);
  let out = '';
  for await (const token of stream) {
    out += token;
    process.stdout.write(token);
  }
  process.stdout.write('\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

