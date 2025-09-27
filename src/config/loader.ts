import fs from 'fs';
import path from 'path';
import { Agent } from '../core/agent';
import type { LLMBase } from '../llms';
import type { Tool } from '../tools';
import {
  AgentConfigSchema,
  StepSchema,
  FlowConfigSchema,
  FlowSchema,
  type AgentConfig,
  type Step,
  type Flow,
} from '../models/schemas';

// Optional dependency: yaml
let yamlParse: ((s: string) => any) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const YAML = require('yaml');
  yamlParse = (s: string) => YAML.parse(s);
} catch {
  yamlParse = null;
}

export type RawConfig = Record<string, any>;

export function loadFileSync(filePath: string): RawConfig {
  const ext = path.extname(filePath).toLowerCase();
  const text = fs.readFileSync(filePath, 'utf8');
  if (ext === '.yaml' || ext === '.yml') {
    if (!yamlParse) throw new Error('YAML parser not installed. Please `npm i yaml`.');
    return yamlParse!(text);
  }
  if (ext === '.json') return JSON.parse(text);
  // Try YAML first then JSON
  if (yamlParse) return yamlParse!(text);
  return JSON.parse(text);
}

// Map raw config (possibly Python-styled) to AgentConfig
export function toAgentConfig(raw: RawConfig): AgentConfig {
  // Normalize steps
  const rawSteps: any[] = raw.steps || raw.Steps || [];
  const steps: Step[] = rawSteps.map((s) => StepSchema.parse(s));

  // Normalize flows (optional)
  const rawFlows: any[] = raw.flows || [];
  const flows: Flow[] | undefined = rawFlows.length
    ? rawFlows.map((f) => {
        const cfg = FlowConfigSchema.parse({
          flow_id: f.flow_id ?? f.id,
          name: f.name,
          desc: f.description ?? f.desc,
          enters: f.enters,
          exits: f.exits,
          steps: f.steps,
          components: f.components,
        });
        return FlowSchema.parse({
          config: cfg,
          steps: (f.steps_list || f.steps || []).map((s: any) => StepSchema.parse(s)),
        });
      })
    : undefined;

  const cfg = AgentConfigSchema.parse({
    name: raw.name,
    persona: raw.persona,
    start_step_id: raw.start_step_id ?? raw.start ?? steps[0]?.step_id,
    steps,
    flows,
    system_message: raw.system_message,
    show_steps_desc: raw.show_steps_desc,
    max_errors: raw.max_errors,
    max_iter: raw.max_iter,
  });
  return cfg;
}

export function createAgentFromConfig(
  rawOrPath: RawConfig | string,
  llm: LLMBase,
  tools: Tool[] = [],
): Agent {
  const raw = typeof rawOrPath === 'string' ? loadFileSync(rawOrPath) : rawOrPath;
  const cfg = toAgentConfig(raw);
  return Agent.fromConfig(cfg, llm, tools);
}
