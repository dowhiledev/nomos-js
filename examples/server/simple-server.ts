import { Agent, OpenAILLM, createTool, createHttpServer } from '../../src/index';
import { z } from 'zod';

// Minimal agent
const llm = new OpenAILLM({ provider: 'openai', model: 'gpt-4o-mini', apiKey: process.env.OPENAI_API_KEY });
const echo = createTool('echo', 'Echo back text', z.object({ text: z.string() }), async ({ text }) => ({ text }));
const steps = [
  { step_id: 'start', description: 'Answer or call echo when user says echo <text>.', available_tools: ['echo'], routes: [] },
];
const agent = new Agent({ name: 'simple', steps, startStepId: 'start', tools: [echo], llm });

// HTTP server with /api/next and /api/stream
const server = createHttpServer(agent, { pathBase: '/api' });
const port = process.env.PORT ? Number(process.env.PORT) : 8788;
server.listen(port, () => console.log(`Nomos server at http://localhost:${port}`));

