import { describe, it, expect } from 'vitest';
import {
  RouteSchema,
  StepSchema,
  AgentConfigSchema,
  DecisionConstraintsSchema,
  DecisionSchema,
  EventSchema,
} from '../src/models/schemas';

describe('Schemas/Normalization', () => {
  it('normalizes route aliases (to/when)', () => {
    const r1 = RouteSchema.parse({ to: 'next', when: 'ok' });
    expect(r1).toEqual({ target: 'next', condition: 'ok' });

    const r2 = RouteSchema.parse({ target: 'end', condition: 'done' });
    expect(r2).toEqual({ target: 'end', condition: 'done' });
  });

  it('normalizes step aliases (id/desc/paths/tools/eg)', () => {
    const s = StepSchema.parse({
      id: 'start',
      desc: 'greet',
      paths: [{ to: 'end', when: 'bye' }],
      tools: ['calc'],
      eg: [{ context: 'hi', decision: { action: 'RESPOND', response: 'hello' } }],
    });
    expect(s.step_id).toBe('start');
    expect(s.description).toBe('greet');
    expect(s.routes[0]).toEqual({ target: 'end', condition: 'bye' });
    expect(s.available_tools).toEqual(['calc']);
    expect(s.examples?.length).toBe(1);
  });

  it('accepts both data/content in Event', () => {
    const e1 = EventSchema.parse({ type: 'info', data: 'x' as any });
    const e2 = EventSchema.parse({ type: 'info', content: 'x' });
    expect(e1.content).toBe('x');
    expect(e2.content).toBe('x');
  });

  it('parses Python-parity decision (step_id, tool_call)', () => {
    const d1 = DecisionSchema.parse({ action: 'MOVE', step_id: 'next' });
    expect(d1.step_id).toBe('next');

    const d2 = DecisionSchema.parse({
      action: 'TOOL_CALL',
      tool_call: { tool_name: 'search', tool_kwargs: { q: 'test' } },
    });
    expect(d2.tool_call?.tool_name).toBe('search');
  });

  it('parses agent config and applies defaults', () => {
    const cfg = AgentConfigSchema.parse({
      name: 'a',
      steps: [{ step_id: 's', description: 'd' }],
      start_step_id: 's',
    });
    expect(cfg.max_iter).toBe(5);
    expect(cfg.show_steps_desc).toBe(false);
  });

  it('parses decision constraints', () => {
    const dc = DecisionConstraintsSchema.parse({ actions: ['RESPOND'], fields: ['response'] });
    expect(dc.actions?.[0]).toBe('RESPOND');
  });
});
