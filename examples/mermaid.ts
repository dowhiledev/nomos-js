import { agentToMermaid } from '../src/utils/mermaid';
import { toAgentConfig, loadFileSync } from '../src/config/loader';

async function main(){
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: tsx examples/mermaid.ts <agent-config.(yaml|json)>');
    process.exit(1);
  }
  const raw = loadFileSync(file);
  const cfg = toAgentConfig(raw);
  const mm = agentToMermaid(cfg.steps, cfg.flows as any);
  console.log(mm);
}

main().catch((e)=>{ console.error(e); process.exit(1); });

