import { OpenAILLM } from '../src/index';
import fs from 'fs';

// Load .env.local for OPENAI_API_KEY
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
  const llm = new OpenAILLM({
    provider: 'openai',
    model: 'gpt-4o-mini',
    apiKey: process.env.OPENAI_API_KEY,
  });

  const stream = await llm.streamText('Write a short haiku about TypeScript.');
  let out = '';
  for await (const token of stream) {
    out += token;
    process.stdout.write(token);
  }
  process.stdout.write('\n---\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
