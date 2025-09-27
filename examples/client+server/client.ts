import { AgentClient } from '../../src/client';
import type { State } from '../../src/models/schemas';
import type { StreamEvent } from '../../src/server/types';
import readline from 'readline';

type Mode = 'stream' | 'next';

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((s) => {
      const m = s.match(/^--([^=]+)=(.*)$/);
      return m ? [m[1], m[2]] : [s.replace(/^--/, ''), true];
    }),
  );
  return args as { mode?: Mode; input?: string } & Record<string, any>;
}

async function chatStream(client: AgentClient) {
  let state: State | undefined = undefined;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('Interactive client (stream mode). Type :help for commands.');
  const ask = () => new Promise<string>((resolve) => rl.question('You: ', resolve));

  while (true) {
    const text = (await ask()).trim();
    if (!text) continue;
    if (text === ':exit' || text === ':quit') {
      rl.close();
      break;
    }
    if (text === ':help') {
      console.log('Commands: :help, :reset, :exit');
      continue;
    }
    if (text === ':reset') {
      state = undefined;
      console.log('(state cleared)');
      continue;
    }

    let inputToSend: string | undefined = text;
    let safety = 0;
    do {
      const printedWhy = new Set<string>();
      const printedTool = new Set<string>();
      const printedAction = new Set<string>();
      let lastAction: string | undefined;
      let startedAssistant = false;
      let finalState: any = undefined;
      let finalResponse: string = '';

      for await (const ev of client.stream(inputToSend, state, { verbose: true, chainMoves: true })) {
        if (ev.type === 'partial') {
          // Print why/tool as they appear (deduped), before any response text
          if (typeof ev.why === 'string' && ev.why.trim() && !printedWhy.has(ev.why)) {
            console.log(`{why:${ev.why}}`);
            printedWhy.add(ev.why);
          }
          if ((ev as any).tool_call) {
            const tc = (ev as any).tool_call as { tool_name: string; tool_args: Record<string, any> };
            const key = `${tc.tool_name}:${JSON.stringify(tc.tool_args || {})}`;
            if (!printedTool.has(key)) {
              console.log(`(tool) ${tc.tool_name} ${JSON.stringify(tc.tool_args || {})}`);
              printedTool.add(key);
            }
          }
          if (ev.action) {
            lastAction = ev.action;
            if (!printedAction.has(ev.action)) {
              console.log(`(action) ${ev.action}`);
              printedAction.add(ev.action);
            }
          }
          if (typeof (ev as any).response_chunk === 'string') {
            if (!startedAssistant) {
              process.stdout.write('Assistant: ');
              startedAssistant = true;
            }
            process.stdout.write((ev as any).response_chunk);
          }
        } else {
          finalState = ev.state as State;
          finalResponse = ev.response || '';
        }
      }

      // After stream ends, print step transition and ensure newline if we streamed text
      if (finalState) {
        if (startedAssistant) console.log();
        console.log(
          `→ step: ${finalState.current_step_id}${finalState.flow_state ? ` (flow: ${finalState.flow_state.flow_id})` : ''}`,
        );
        state = finalState;
        // If nothing was streamed, but last action is RESPOND, print the final response
        if (!startedAssistant && lastAction === 'RESPOND' && finalResponse && finalResponse.trim()) {
          console.log('Assistant:', finalResponse);
        }
      }

      // Decide whether to chain another .stream() call client-side
      if (!startedAssistant && (lastAction === 'MOVE' || lastAction === 'TOOL_CALL') && safety++ < 3) {
        inputToSend = undefined; // follow-up turn with no user text
        continue;
      }
      break;
    } while (true);
  }
}

async function chatNext(client: AgentClient) {
  let state: any = undefined;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('Interactive client (non-stream mode). Type :help for commands.');
  const ask = () => new Promise<string>((resolve) => rl.question('You: ', resolve));

  while (true) {
    const text = (await ask()).trim();
    if (!text) continue;
    if (text === ':exit' || text === ':quit') {
      rl.close();
      break;
    }
    if (text === ':help') {
      console.log('Commands: :help, :reset, :exit');
      continue;
    }
    if (text === ':reset') {
      state = undefined;
      console.log('(state cleared)');
      continue;
    }

    const res = await client.next(text, state, { verbose: true, chainMoves: true });
    state = res.state;
    console.log('Assistant:', res.response || '(no text)');
    if (state?.current_step_id)
      console.log(
        `→ step: ${state.current_step_id}${state.flow_state ? ` (flow: ${state.flow_state.flow_id})` : ''}`,
      );
  }
}

async function main() {
  const args = parseArgs();
  let mode: Mode = (args.mode as any) || 'stream';
  const client = new AgentClient({ baseUrl: 'http://localhost:8788/api' });
  console.log(`Mode: ${mode}`);
  if (mode === 'next') await chatNext(client);
  else await chatStream(client);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
