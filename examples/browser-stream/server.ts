import http from 'http';
import fs from 'fs';
import path from 'path';
import { Agent, OpenAILLM, createTool } from '../../src/index';
import type { EventEmitter, SessionEvent } from '../../src/index';
import { z } from 'zod';

// Load env
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

// Tools
const getAvailableCoffeeOptions = createTool('get_available_coffee_options', 'Return available coffee options.', z.object({}), async () => ({
  options: [
    { coffee_type: 'Espresso', sizes: ['Small', 'Medium', 'Large'], price: { Small: 3.0, Medium: 3.5, Large: 4.0 } },
    { coffee_type: 'Latte', sizes: ['Small', 'Medium', 'Large'], price: { Small: 4.0, Medium: 4.5, Large: 5.0 } },
    { coffee_type: 'Cappuccino', sizes: ['Small', 'Medium', 'Large'], price: { Small: 4.0, Medium: 4.5, Large: 5.0 } },
  ],
}));
const addToCart = createTool('add_to_cart', 'Add a coffee item to cart.', z.object({ coffee_type: z.string(), size: z.string(), price: z.number().optional() }), async ({ coffee_type, size, price }) => ({ message: `Added ${size} ${coffee_type}${price ? ` ($${price.toFixed(2)})` : ''} to cart.` }));
const removeItem = createTool('remove_item', 'Remove item by id', z.object({ item_id: z.string() }), async ({ item_id }) => ({ message: `Removed ${item_id}` }));
const clearCart = createTool('clear_cart', 'Clear cart', z.object({}), async () => ({ message: 'Cart cleared.' }));
const getOrderSummary = createTool('get_order_summary', 'Get summary + total', z.object({}), async () => ({ summary: ['1x Latte (Medium) - $4.50', '1x Espresso (Small) - $3.00'], total: 7.5 }));
const finalizeOrder = createTool('finalize_order', 'Finalize order', z.object({ payment_method: z.enum(['Card', 'Cash']), payment: z.number().optional() }), async ({ payment_method, payment }) => ({ message: `Order finalized with ${payment_method}${payment_method === 'Cash' && payment ? ` ($${payment.toFixed(2)})` : ''}.` }));

const steps = [
  { step_id: 'start', description: 'Greet and offer help. Use get_available_coffee_options if needed. MOVE to take_coffee_order when ready.', available_tools: ['get_available_coffee_options'], routes: [{ target: 'take_coffee_order', condition: 'Ready to order' }], examples: [{ context: 'User asks for options', decision: { action: 'TOOL_CALL', tool_call: { tool_name: 'get_available_coffee_options', tool_kwargs: {} } } }] },
  { step_id: 'take_coffee_order', description: 'Ask for coffee and size. Use add_to_cart/remove_item/clear_cart. MOVE to finalize_order when done.', available_tools: ['get_available_coffee_options', 'add_to_cart', 'remove_item', 'clear_cart'], routes: [{ target: 'finalize_order', condition: 'User wants to finalize the order' }, { target: 'end', condition: 'Cancel' }], flow_id: 'take_coffee_order' },
  { step_id: 'finalize_order', description: 'Get order summary then finalize; change order -> take_coffee_order; cancel -> end.', available_tools: ['get_order_summary', 'finalize_order'], routes: [{ target: 'end', condition: 'Order finalized or canceled' }, { target: 'take_coffee_order', condition: 'Change order' }] },
  { step_id: 'end', description: 'Clear the cart and end.', available_tools: ['clear_cart'], routes: [] },
];
const flows = [ { config: { flow_id: 'take_coffee_order', name: 'Coffee Ordering', enters: ['take_coffee_order'], exits: ['finalize_order', 'end'] }, steps: [] } ];

const eventLog = new Map<string, Array<any>>();
const emitter: EventEmitter = {
  emit(evt: SessionEvent){
    const arr = eventLog.get(evt.sessionId) || [];
    arr.push({ ts: evt.timestamp, type: evt.type, data: evt.data, decision: evt.decision });
    eventLog.set(evt.sessionId, arr);
  }
};

const agent = new Agent({ name: 'barista_stream_web', steps, flows, startStepId: 'start', tools: [getAvailableCoffeeOptions, addToCart, removeItem, clearCart, getOrderSummary, finalizeOrder], llm, eventEmitter: emitter as any });

function sendNDJSON(res: http.ServerResponse, obj: any){ res.write(JSON.stringify(obj) + '\n'); }

const server = http.createServer(async (req, res) => {
  const url = req.url || '/';
  const method = req.method || 'GET';
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

  if (method === 'POST' && url === '/api/stream') {
    // Streaming NDJSON
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { userInput, state } = JSON.parse(body || '{}');
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Transfer-Encoding', 'chunked');
        let lastAction: string | undefined;
        let hadAnyChunk = false;
        let lastState: any = state;
        let turns = 0;
        async function streamOneTurn(input: any){
          hadAnyChunk = false;
          for await (const upd of agent.streamNext(input, lastState, true, false, true)) {
            if (upd.decision && (upd.decision as any).action) {
              lastAction = (upd.decision as any).action as string;
              sendNDJSON(res, { type: 'partial', action: lastAction });
            }
            if (upd.decision && Array.isArray((upd.decision as any).reasoning)) {
              for (const r of (upd.decision as any).reasoning as string[]) {
                if (r && r.trim()) sendNDJSON(res, { type: 'partial', why: r });
              }
            }
            if (upd.tool_call) {
              sendNDJSON(res, { type: 'partial', tool_call: { tool_name: upd.tool_call.tool_name, tool_args: upd.tool_call.tool_args || {} } });
            }
            if (typeof upd.response_chunk === 'string' && upd.response_chunk.length > 0) {
              hadAnyChunk = true;
              sendNDJSON(res, { type: 'partial', response_chunk: upd.response_chunk });
            }
            if (upd.type === 'final' && upd.response) {
              lastState = upd.response.state;
              // include current event log snapshot
              const logs = eventLog.get(lastState.session_id) || [];
              sendNDJSON(res, { type: 'final', response: upd.response.response || '', state: lastState, events: logs });
            }
          }
        }
        // Stream initial turn
        await streamOneTurn(userInput);
        // Auto-chain if MOVE/TOOL_CALL with no streamed text
        while (!hadAnyChunk && (lastAction === 'MOVE' || lastAction === 'TOOL_CALL') && turns < 3) {
          turns++;
          await streamOneTurn(undefined);
        }
        res.end();
      } catch (e: any) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: e?.message || String(e) }));
      }
    });
    return;
  }

  if (method === 'POST' && url === '/api/reset') { eventLog.clear(); res.end(JSON.stringify({ ok: true })); return; }

  // Static
  const root = path.join(process.cwd(), 'examples', 'browser-stream');
  let file = path.join(root, url === '/' ? 'index.html' : url);
  if (!file.startsWith(root)) { res.statusCode = 404; return res.end('Not found'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.statusCode = 404; return res.end('Not found'); }
    const ext = path.extname(file);
    const ct = ext === '.html' ? 'text/html' : 'application/javascript';
    res.setHeader('Content-Type', ct);
    res.end(data);
  });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 8788;
server.listen(PORT, () => console.log(`Barista streaming demo at http://localhost:${PORT}`));
