import { AgentClient } from '../../src/index';

async function main(){
  const client = new AgentClient({ baseUrl: 'http://localhost:8788/api' });
  console.log('--- next()');
  const res = await client.next('Hello there');
  console.log(res.response);

  console.log('\n--- stream()');
  for await (const ev of client.stream('Stream a reply, please')) {
    if (ev.type === 'partial') {
      if (ev.action) process.stdout.write(`[action:${ev.action}] `);
      if (ev.why) process.stdout.write(`why:${ev.why} | `);
      if (ev.response_chunk) process.stdout.write(ev.response_chunk);
    } else {
      console.log(`\nFINAL: ${ev.response}`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });

