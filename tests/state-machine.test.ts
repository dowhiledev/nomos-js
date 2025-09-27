import { describe, it, expect } from 'vitest';
import { StateMachine } from '../src/core/state-machine';

describe('StateMachine', () => {
  it('validates routes and tracks flow transitions', () => {
    const steps = new Map([
      [
        'a',
        {
          step_id: 'a',
          description: 'A',
          routes: [{ target: 'b', condition: 'go' }],
          available_tools: [],
          flow_id: 'flow1',
        } as any,
      ],
      [
        'b',
        {
          step_id: 'b',
          description: 'B',
          routes: [{ target: 'c', condition: 'next' }],
          available_tools: [],
          flow_id: 'flow1',
        } as any,
      ],
      ['c', { step_id: 'c', description: 'C', routes: [], available_tools: [] } as any],
    ]);

    const sm = new StateMachine({ steps, startStepId: 'a' });
    expect(sm.currentStepId).toBe('a');
    expect(sm.currentFlowId).toBe('flow1');
    sm.currentStepId = 'b';
    const t1 = sm.consumeFlowTransition();
    // within same flow -> may not record a transition
    expect(t1 === undefined || (t1.from === 'flow1' && t1.to === 'flow1')).toBeTruthy();
    sm.currentStepId = 'c';
    const t2 = sm.consumeFlowTransition();
    // exiting flow
    expect(t2?.from).toBe('flow1');
    expect(t2?.to).toBeUndefined();
  });
});
