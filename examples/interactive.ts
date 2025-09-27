import { Agent, OpenAILLM, createTool } from '../src/index';
import type { EventEmitter, SessionEvent } from '../src/index';
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
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        )
          val = val.slice(1, -1);
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

  // === Barista tools (mocked behavior) ===
  const getAvailableCoffeeOptions = createTool(
    'get_available_coffee_options',
    'Return the list of available coffee options with sizes and prices.',
    z.object({}).optional().default(z.object({}).parse({})),
    async () => ({
      options: [
        {
          coffee_type: 'Espresso',
          sizes: ['Small', 'Medium', 'Large'],
          price: { Small: 3.0, Medium: 3.5, Large: 4.0 },
        },
        {
          coffee_type: 'Latte',
          sizes: ['Small', 'Medium', 'Large'],
          price: { Small: 4.0, Medium: 4.5, Large: 5.0 },
        },
        {
          coffee_type: 'Cappuccino',
          sizes: ['Small', 'Medium', 'Large'],
          price: { Small: 4.0, Medium: 4.5, Large: 5.0 },
        },
      ],
    }),
  );

  const addToCart = createTool(
    'add_to_cart',
    'Add a coffee item to the cart. Args: coffee_type, size, price',
    z.object({ coffee_type: z.string(), size: z.string(), price: z.number().optional() }),
    async ({ coffee_type, size, price }) => ({
      message:
        `Added ${size} ${coffee_type} ${price ? `($${price.toFixed(2)})` : ''} to cart.`.trim(),
    }),
  );

  const removeItem = createTool(
    'remove_item',
    'Remove an item from cart by item_id',
    z.object({ item_id: z.string() }),
    async ({ item_id }) => ({ message: `Removed item ${item_id} from cart.` }),
  );

  const clearCart = createTool('clear_cart', 'Clear the shopping cart', z.object({}), async () => ({
    message: 'Cart cleared.',
  }));

  const getOrderSummary = createTool(
    'get_order_summary',
    'Get current order summary with total price',
    z.object({}),
    async () => ({
      summary: ['1x Latte (Medium) - $4.50', '1x Espresso (Small) - $3.00'],
      total: 7.5,
    }),
  );

  const finalizeOrder = createTool(
    'finalize_order',
    'Finalize the order. Args: payment_method (Card or Cash), payment (number, if Cash)',
    z.object({ payment_method: z.enum(['Card', 'Cash']), payment: z.number().optional() }),
    async ({ payment_method, payment }) => ({
      message: `Order finalized with ${payment_method}${payment_method === 'Cash' && payment ? ` ($${payment.toFixed(2)})` : ''}. Thank you!`,
    }),
  );

  // === Barista steps and flows (aligned with cookbook YAML) ===
  const steps = [
    {
      step_id: 'start',
      description:
        'Greet the customer and ask how can I help them. Use get_available_coffee_options when needed; recommend options. When ready to order, MOVE to take_coffee_order.',
      available_tools: ['get_available_coffee_options'],
      routes: [
        { target: 'take_coffee_order', condition: 'Customer is ready to place a new order' },
      ],
      examples: [
        {
          context: 'Customer asked for coffee options',
          decision: {
            action: 'TOOL_CALL',
            tool_call: { tool_name: 'get_available_coffee_options', tool_kwargs: {} },
          },
          visibility: 'always' as const,
        },
      ],
    },
    {
      step_id: 'take_coffee_order',
      description:
        'Ask for coffee preference and size. Use add_to_cart/remove_item/clear_cart tools. When done, MOVE to finalize_order; cancel → end.',
      available_tools: ['get_available_coffee_options', 'add_to_cart', 'remove_item', 'clear_cart'],
      routes: [
        { target: 'finalize_order', condition: 'User wants to finalize the order' },
        { target: 'end', condition: 'Customer wants to cancel the order' },
      ],
      flow_id: 'take_coffee_order',
    },
    {
      step_id: 'finalize_order',
      description:
        'Get order summary (get_order_summary), inform total, then finalize (finalize_order). Change order → take_coffee_order; cancel → end.',
      available_tools: ['get_order_summary', 'finalize_order'],
      routes: [
        { target: 'end', condition: 'Order is finalized or canceled' },
        {
          target: 'take_coffee_order',
          condition: 'Customer wants to change the order or add more items or start over',
        },
      ],
    },
    {
      step_id: 'end',
      description: 'Clear the cart and end the conversation graciously.',
      available_tools: ['clear_cart'],
      routes: [],
    },
  ];

  const flows = [
    {
      config: {
        flow_id: 'take_coffee_order',
        name: 'Complete coffee ordering process',
        enters: ['take_coffee_order'],
        exits: ['finalize_order', 'end'],
      },
      steps: [],
    },
  ];

  // Event log collector + simple per-session cart store
  const events: Array<{ ts: string; type: string; data?: any; sid?: string }> = [];
  const carts = new Map<
    string,
    Array<{ item_id: string; coffee_type: string; size: string; price?: number }>
  >();
  let nextItemId = 1;
  const emitter: EventEmitter = {
    emit(evt: SessionEvent) {
      const ts = new Date(evt.timestamp).toLocaleString();
      events.push({ ts, type: evt.type, data: evt.data || evt.decision, sid: evt.sessionId });
      // Maintain a per-session cart by watching tool_called events
      try {
        if (evt.type === 'tool_called' && evt.data && evt.sessionId) {
          const name = evt.data.tool_name as string;
          const args = evt.data.tool_args || {};
          const cart = carts.get(evt.sessionId) || [];
          if (name === 'add_to_cart') {
            cart.push({
              item_id: String(nextItemId++),
              coffee_type: String(args.coffee_type || 'Unknown'),
              size: String(args.size || 'Medium'),
              price: typeof args.price === 'number' ? args.price : undefined,
            });
            carts.set(evt.sessionId, cart);
          } else if (name === 'remove_item') {
            const id = String(args.item_id || '');
            const updated = cart.filter((i) => i.item_id !== id);
            carts.set(evt.sessionId, updated);
          } else if (name === 'clear_cart') {
            carts.set(evt.sessionId, []);
          } else if (name === 'finalize_order') {
            // empty cart after finalize
            carts.set(evt.sessionId, []);
          }
        }
      } catch {}
      if (events.length > 200) events.shift();
    },
  };

  const agent = new Agent({
    name: 'barista',
    steps,
    flows,
    startStepId: 'start',
    tools: [
      getAvailableCoffeeOptions,
      addToCart,
      removeItem,
      clearCart,
      getOrderSummary,
      finalizeOrder,
    ],
    llm,
    eventEmitter: emitter as any,
  });

  let state: any = undefined;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log(
    'Barista interactive demo. Type your message (or :events, :state, :cart, :reset, :help). Ctrl+C to exit.',
  );

  const ask = () => new Promise<string>((resolve) => rl.question('You: ', resolve));

  function printState(s: any) {
    console.log('State:');
    console.log('  current_step:', s.current_step_id);
    if (s.flow_state) {
      console.log('  flow_id:', s.flow_state.flow_id);
      console.log('  flow_context:', s.flow_state.flow_context);
    }
    const cart = carts.get(s.session_id) || [];
    if (cart.length) {
      console.log(
        '  cart:',
        cart
          .map(
            (i) =>
              `${i.item_id}:${i.size} ${i.coffee_type}${i.price ? ` $${i.price.toFixed(2)}` : ''}`,
          )
          .join(', '),
      );
    } else {
      console.log('  cart: (empty)');
    }
  }

  function printEvents() {
    console.log('Event log (last', events.length, '):');
    for (const e of events.slice(-30)) {
      console.log(`  ${e.ts} – ${e.type} ${e.data ? JSON.stringify(e.data) : ''}`);
    }
  }

  let lastPrinted = 0;
  function printNewEventsInline() {
    const fresh = events.slice(lastPrinted);
    for (const e of fresh) {
      if (
        e.type === 'step_move' ||
        e.type === 'tool_called' ||
        e.type === 'flow_enter' ||
        e.type === 'flow_exit'
      ) {
        console.log(`  ↳ ${e.ts} – ${e.type} ${e.data ? JSON.stringify(e.data) : ''}`);
      }
    }
    lastPrinted = events.length;
  }

  while (true) {
    const input = await ask();
    if (input === ':help') {
      console.log('Commands:');
      console.log('  :events  – show recent events');
      console.log('  :state   – show state + flow context');
      console.log('  :reset   – clear state and events');
      console.log('  <text>   – send user message');
      continue;
    }
    if (input === ':events') {
      printEvents();
      continue;
    }
    if (input === ':state') {
      if (state) printState(state);
      else console.log('No state yet.');
      continue;
    }
    if (input === ':cart') {
      if (state) {
        const cart = carts.get(state.session_id) || [];
        console.log('Cart:', cart);
      } else console.log('No state yet.');
      continue;
    }
    if (input === ':reset') {
      state = undefined;
      events.length = 0;
      carts.clear();
      console.log('State and events cleared.');
      continue;
    }

    let res = await agent.next(input, state, true, false, true, undefined, true);
    state = res.state;
    if (res.response) console.log('Assistant:', res.response);
    // Auto-chaining enabled via chainMoves flag; no manual loop needed
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
