import { Agent, OpenAILLM, createTool, createHttpServer } from '../../src/index';
import type { EventEmitter, SessionEvent } from '../../src/index';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

// Load env (from .env.local if present)
try {
  if (!process.env.OPENAI_API_KEY && fs.existsSync(path.join(process.cwd(), '.env.local'))) {
    const c = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
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

// Barista agent (from interactive demo)
const llm = new OpenAILLM({ provider: 'openai', model: 'gpt-4o-mini', apiKey: process.env.OPENAI_API_KEY });

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

const events: any[] = [];
const emitter: EventEmitter = { emit(evt: SessionEvent){ events.push(evt); if (events.length>200) events.shift(); } };

const agent = new Agent({ name: 'barista', steps, flows, startStepId: 'start', tools: [getAvailableCoffeeOptions, addToCart, removeItem, clearCart, getOrderSummary, finalizeOrder], llm, eventEmitter: emitter as any });

// HTTP server with /api/next and /api/stream
const server = createHttpServer(agent, { pathBase: '/api' });
const port = process.env.PORT ? Number(process.env.PORT) : 8788;
server.listen(port, () => console.log(`Nomos server at http://localhost:${port}`));
