import { AgentClient } from '../../src/index';
import readline from 'readline';

type Mode = 'stream' | 'next';

function parseArgs(){
  const args = Object.fromEntries(process.argv.slice(2).map(s => {
    const m = s.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [s.replace(/^--/, ''), true];
  }));
  return args as { mode?: Mode; input?: string } & Record<string, any>;
}

async function chatStream(client: AgentClient) {
  let state: any = undefined;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('Interactive client (stream mode). Type :help for commands.');
  const ask = () => new Promise<string>(resolve => rl.question('You: ', resolve));

  while (true) {
    const text = (await ask()).trim();
    if (!text) continue;
    if (text === ':exit' || text === ':quit') { rl.close(); break; }
    if (text === ':help') { console.log('Commands: :help, :reset, :exit'); continue; }
    if (text === ':reset') { state = undefined; console.log('(state cleared)'); continue; }

    const whySet = new Set<string>();
    const toolCalls: Array<{ tool_name: string; tool_args: Record<string, any> }> = [];
    let responseBuf = '';
    let lastAction: string | undefined;
    let final: { response: string; state: any } | null = null;

    for await (const ev of client.stream(text, state, { verbose: true })) {
      if (ev.type === 'partial') {
        if (ev.action) lastAction = ev.action;
        if (typeof ev.why === 'string' && ev.why.trim() && !whySet.has(ev.why)) {
          whySet.add(ev.why);
        }
        if ((ev as any).tool_call) {
          const tc = (ev as any).tool_call as { tool_name: string; tool_args: Record<string, any> };
          const key = `${tc.tool_name}:${JSON.stringify(tc.tool_args || {})}`;
          if (!toolCalls.find(t => `${t.tool_name}:${JSON.stringify(t.tool_args||{})}` === key)) {
            toolCalls.push({ tool_name: tc.tool_name, tool_args: tc.tool_args || {} });
          }
        }
        if (typeof (ev as any).response_chunk === 'string') {
          responseBuf += (ev as any).response_chunk;
        }
      } else {
        final = { response: ev.response, state: ev.state };
      }
    }

    if (final) {
      state = final.state;
      // Print why/tool/step first
      for (const w of whySet) {
        console.log(`{why:${w}}`);
      }
      for (const t of toolCalls) {
        console.log(`(tool) ${t.tool_name} ${JSON.stringify(t.tool_args)}`);
      }
      console.log(`→ step: ${state.current_step_id}${state.flow_state ? ` (flow: ${state.flow_state.flow_id})` : ''}`);
      // Then print response if the last action is RESPOND
      if (lastAction === 'RESPOND') {
        const textOut = responseBuf && responseBuf.trim().length > 0 ? responseBuf : (final.response || '');
        if (textOut && textOut.trim().length > 0) console.log('Assistant:', textOut);
      }
    }
  }
}

async function chatNext(client: AgentClient) {
  let state: any = undefined;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('Interactive client (non-stream mode). Type :help for commands.');
  const ask = () => new Promise<string>(resolve => rl.question('You: ', resolve));

  while (true) {
    const text = (await ask()).trim();
    if (!text) continue;
    if (text === ':exit' || text === ':quit') { rl.close(); break; }
    if (text === ':help') { console.log('Commands: :help, :reset, :exit'); continue; }
    if (text === ':reset') { state = undefined; console.log('(state cleared)'); continue; }

    const res = await client.next(text, state, { verbose: true });
    state = res.state;
    console.log('Assistant:', res.response || '(no text)');
    if (state?.current_step_id) console.log(`→ step: ${state.current_step_id}${state.flow_state ? ` (flow: ${state.flow_state.flow_id})` : ''}`);
  }
}

async function main(){
  const args = parseArgs();
  let mode: Mode = (args.mode as any) || 'stream';
  const client = new AgentClient({ baseUrl: 'http://localhost:8788/api' });
  console.log(`Mode: ${mode}`);
  if (mode === 'next') await chatNext(client); else await chatStream(client);
}

main().catch(err => { console.error(err); process.exit(1); });
