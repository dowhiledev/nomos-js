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

function prettyArgs(args: Record<string, any>): string {
  try {
    return JSON.stringify(args);
  } catch {
    return String(args);
  }
}

async function main() {
  const llm = new OpenAILLM({
    provider: 'openai',
    model: 'gpt-4o-mini',
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Tools (mocked behavior sufficient for demo)
  const getAvailableCoffeeOptions = createTool(
    'get_available_coffee_options',
    'Return available coffee options.',
    z.object({}),
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
    'Add a coffee item to cart.',
    z.object({ coffee_type: z.string(), size: z.string(), price: z.number().optional() }),
    async ({ coffee_type, size, price }) => ({
      message: `Added ${size} ${coffee_type}${price ? ` ($${price.toFixed(2)})` : ''} to cart.`,
    }),
  );
  const removeItem = createTool(
    'remove_item',
    'Remove an item by id',
    z.object({ item_id: z.string() }),
    async ({ item_id }) => ({ message: `Removed ${item_id}` }),
  );
  const clearCart = createTool('clear_cart', 'Clear the cart', z.object({}), async () => ({
    message: 'Cart cleared.',
  }));
  const getOrderSummary = createTool(
    'get_order_summary',
    'Get summary + total',
    z.object({}),
    async () => ({
      summary: ['1x Latte (Medium) - $4.50', '1x Espresso (Small) - $3.00'],
      total: 7.5,
    }),
  );
  const finalizeOrder = createTool(
    'finalize_order',
    'Finalize the order',
    z.object({ payment_method: z.enum(['Card', 'Cash']), payment: z.number().optional() }),
    async ({ payment_method, payment }) => ({
      message: `Order finalized with ${payment_method}${payment_method === 'Cash' && payment ? ` ($${payment.toFixed(2)})` : ''}.`,
    }),
  );

  // Barista-like steps + flow
  const steps = [
    {
      step_id: 'start',
      description:
        'Greet and offer help. Use get_available_coffee_options if needed. MOVE to take_coffee_order when ready.',
      available_tools: ['get_available_coffee_options'],
      routes: [{ target: 'take_coffee_order', condition: 'Ready to order' }],
      examples: [
        {
          context: 'User asks for options',
          decision: {
            action: 'TOOL_CALL',
            tool_call: { tool_name: 'get_available_coffee_options', tool_kwargs: {} },
          },
        },
      ],
    },
    {
      step_id: 'take_coffee_order',
      description:
        'Ask for coffee and size. Use add_to_cart/remove_item/clear_cart. MOVE to finalize_order when done.',
      available_tools: ['get_available_coffee_options', 'add_to_cart', 'remove_item', 'clear_cart'],
      routes: [
        { target: 'finalize_order', condition: 'User wants to finalize the order' },
        { target: 'end', condition: 'Cancel' },
      ],
      flow_id: 'take_coffee_order',
    },
    {
      step_id: 'finalize_order',
      description:
        'Get order summary then finalize; change order -> take_coffee_order; cancel -> end.',
      available_tools: ['get_order_summary', 'finalize_order'],
      routes: [
        { target: 'end', condition: 'Order finalized or canceled' },
        { target: 'take_coffee_order', condition: 'Change order' },
      ],
    },
    {
      step_id: 'end',
      description: 'Clear the cart and end.',
      available_tools: ['clear_cart'],
      routes: [],
    },
  ];
  const flows = [
    {
      config: {
        flow_id: 'take_coffee_order',
        name: 'Coffee Ordering',
        enters: ['take_coffee_order'],
        exits: ['finalize_order', 'end'],
      },
      steps: [],
    },
  ];

  const agent = new Agent({
    name: 'barista_stream',
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
  });

  let state: any = undefined;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('Barista streaming demo. Type your message (or :reset, :help). Ctrl+C to exit.');
  const ask = () => new Promise<string>((resolve) => rl.question('You: ', resolve));

  async function streamTurn(text?: string) {
    const color = {
      magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
      cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
      yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
      dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
    };
    let hadAnyChunk = false;
    let lastAction: string | undefined;
    let toolAnnounced = false;
    let pendingTool: { name?: string; args: Record<string, any> } = { args: {} };
    let printedAssistantHeader = false;
    const printedReasons = new Set<string>();

    for await (const upd of agent.streamNext(text, state, true, false, true)) {
      // Action (print only valid explicit actions) BEFORE any assistant text
      if (!printedAssistantHeader && upd.decision && (upd.decision as any).action) {
        const act = (upd.decision as any).action as string;
        if (['MOVE', 'RESPOND', 'TOOL_CALL', 'END'].includes(act) && act !== lastAction) {
          lastAction = act;
          process.stdout.write(`${color.cyan('(action)')} ${act}\n`);
        }
      }

      // Reasoning (print new non-empty lines) BEFORE any assistant text
      if (
        !printedAssistantHeader &&
        upd.decision &&
        Array.isArray((upd.decision as any).reasoning)
      ) {
        for (const r of (upd.decision as any).reasoning as string[]) {
          const line = (r || '').trim();
          if (line && !printedReasons.has(line)) {
            printedReasons.add(line);
            process.stdout.write(`${color.yellow('(why)')} ${line}\n`);
          }
        }
      }

      // Tool call (gather args; announce once when args are present) BEFORE assistant text
      if (!printedAssistantHeader && upd.tool_call) {
        pendingTool.name = upd.tool_call.tool_name;
        try {
          const newArgs = upd.tool_call.tool_args || {};
          pendingTool.args = { ...pendingTool.args, ...newArgs };
        } catch {}
        if (!toolAnnounced && pendingTool.name && Object.keys(pendingTool.args).length > 0) {
          toolAnnounced = true;
          const args = prettyArgs(pendingTool.args);
          process.stdout.write(`${color.magenta('(tool)')} ${pendingTool.name} ${args}\n`);
        }
      }

      // Stream assistant text chunks for RESPOND
      if (typeof upd.response_chunk === 'string' && upd.response_chunk.length > 0) {
        if (!printedAssistantHeader) {
          printedAssistantHeader = true;
          process.stdout.write('Assistant: ');
        }
        hadAnyChunk = true;
        process.stdout.write(upd.response_chunk);
      }

      // Finalize
      if (upd.type === 'final' && upd.response) {
        // If a tool was never announced but exists, announce name (args may be empty)
        if (!toolAnnounced && pendingTool.name) {
          const args = prettyArgs(pendingTool.args || {});
          process.stdout.write(`${color.magenta('(tool)')} ${pendingTool.name} ${args}\n`);
        }
        const finalText = typeof upd.response.response === 'string' ? upd.response.response : '';
        if (!hadAnyChunk && finalText) {
          if (!printedAssistantHeader) process.stdout.write('Assistant: ');
          process.stdout.write(finalText);
        }
        if (printedAssistantHeader || (!hadAnyChunk && finalText)) process.stdout.write('\n');
        state = upd.response.state as any;
      }
    }
    return { hadAnyChunk, lastAction };
  }

  while (true) {
    const input = await ask();
    if (input === ':help') {
      console.log('Commands: :reset – clear state');
      continue;
    }
    if (input === ':reset') {
      state = undefined;
      console.log('State cleared.');
      continue;
    }
    const res = await streamTurn(input);
    let safety = 0;
    while (
      !res.hadAnyChunk &&
      (res.lastAction === 'MOVE' || res.lastAction === 'TOOL_CALL') &&
      safety < 3
    ) {
      const r2 = await streamTurn(undefined);
      if (r2.hadAnyChunk || (r2.lastAction !== 'MOVE' && r2.lastAction !== 'TOOL_CALL')) break;
      safety++;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
