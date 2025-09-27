import http from 'http';
import fs from 'fs';
import path from 'path';
import { Agent, OpenAILLM, createTool } from '../../src/index';
import type { EventEmitter, SessionEvent } from '../../src/index';
import { z } from 'zod';

// Load .env.local for OPENAI_API_KEY
try {
  if (!process.env.OPENAI_API_KEY && fs.existsSync(path.join(process.cwd(), '.env.local'))) {
    const content = fs.readFileSync('.env.local', 'utf8');
    for (const line of content.split('\n')) {
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

const llm = new OpenAILLM({ provider: 'openai', model: 'gpt-4o-mini', apiKey: process.env.OPENAI_API_KEY });

// Define tools and steps (flows included)
const timeTool = createTool('get_time', 'Return the current local time.', z.object({}), async () => ({ time: new Date().toLocaleString() }));

const steps = [
  { step_id: 'start', description: 'Welcome user. Move to time or start booking flow.', routes: [ { target: 'time', condition: 'User asks for time' }, { target: 'book_entry', condition: 'User wants to start booking' } ], available_tools: [] },
  { step_id: 'time', description: 'Call get_time tool and tell user, then end.', routes: [ { target: 'end', condition: 'After time' } ], available_tools: ['get_time'] },
  { step_id: 'book_entry', description: 'Enter booking flow', routes: [ { target: 'collect', condition: 'Proceed' } ], available_tools: [], flow_id: 'booking' },
  { step_id: 'collect', description: 'Ask for user name', routes: [ { target: 'confirm', condition: 'Got info' } ], available_tools: [], flow_id: 'booking' },
  { step_id: 'confirm', description: 'Confirm and exit flow', routes: [ { target: 'end', condition: 'Finish' } ], available_tools: [], flow_id: 'booking' },
  { step_id: 'end', description: 'End', routes: [], available_tools: [] },
];

const flows = [
  {
    config: { flow_id: 'booking', name: 'Booking Flow', enters: ['book_entry'], exits: ['confirm'] },
    steps: [],
  },
];

const eventLog = new Map<string, Array<any>>();
const emitter: EventEmitter = {
  emit(evt: SessionEvent) {
    const arr = eventLog.get(evt.sessionId) || [];
    arr.push({ ts: evt.timestamp, type: evt.type, data: evt.data, decision: evt.decision });
    eventLog.set(evt.sessionId, arr);
  },
};

const agent = new Agent({ name: 'browser_demo', steps, flows, startStepId: 'start', tools: [timeTool], llm, eventEmitter: emitter as any });

function sendJson(res: http.ServerResponse, status: number, data: any) {
  res.statusCode = status;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function notFound(res: http.ServerResponse) { sendJson(res, 404, { error: 'Not found' }); }

const server = http.createServer(async (req, res) => {
  const url = req.url || '/';
  const method = req.method || 'GET';
  // CORS preflight
  if (method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.end();
    return;
  }

  if (method === 'POST' && url === '/api/decision') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', async () => {
      try {
        const { userInput, state } = JSON.parse(body || '{}');
        let resp = await agent.next(userInput, state, true, false, true);
        // Ensure auto-advance on server too
        let safety = 0;
        while (resp.decision && (resp.decision.action === 'MOVE' || resp.decision.action === 'TOOL_CALL') && safety < 5) {
          resp = await agent.next(undefined, resp.state, true, false, true);
          safety++;
        }
        const logs = eventLog.get(resp.state.session_id) || [];
        sendJson(res, 200, { ...resp, debug: { events: logs } });
      } catch (e: any) {
        sendJson(res, 500, { error: e?.message || String(e) });
      }
    });
    return;
  }

  if (method === 'POST' && url === '/api/reset') {
    eventLog.clear();
    sendJson(res, 200, { ok: true });
    return;
  }

  // Serve static files (index.html and main.js)
  const root = path.join(process.cwd(), 'examples', 'browser');
  let filePath = path.join(root, url === '/' ? 'index.html' : url);
  if (!filePath.startsWith(root)) return notFound(res);
  fs.readFile(filePath, (err, data) => {
    if (err) return notFound(res);
    const ext = path.extname(filePath);
    const ct = ext === '.html' ? 'text/html' : 'application/javascript';
    res.statusCode = 200;
    res.setHeader('Content-Type', ct);
    res.end(data);
  });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
server.listen(PORT, () => {
  console.log(`Browser demo running at http://localhost:${PORT}`);
});
