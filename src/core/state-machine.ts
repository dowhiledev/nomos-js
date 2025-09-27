import type { Step, Flow } from '../models/schemas';

export interface StateMachineConfig {
  steps: Map<string, Step>;
  startStepId: string;
  flows?: Flow[];
}

export class StateMachine {
  private steps: Map<string, Step>;
  private flows?: Flow[];
  private _currentStepId: string;
  private _currentFlowId?: string;
  private _lastFlowTransition?: { from?: string; to?: string };
  private stepToFlow = new Map<string, string | undefined>();
  private flowConfig = new Map<string, Flow['config']>();
  private _prevStepId?: string;

  constructor(config: StateMachineConfig) {
    this.steps = config.steps;
    this.flows = config.flows;
    if (!this.steps.has(config.startStepId)) {
      throw new Error(`Start step '${config.startStepId}' not found`);
    }
    // Build flow maps
    for (const [, step] of this.steps) {
      if (step.flow_id) this.stepToFlow.set(step.step_id, step.flow_id);
    }
    for (const f of this.flows || []) {
      this.flowConfig.set(f.config.flow_id, f.config);
      for (const sid of f.config.steps || []) {
        this.stepToFlow.set(sid, f.config.flow_id);
      }
    }
    this._currentStepId = config.startStepId;
    this._currentFlowId =
      this.stepToFlow.get(this._currentStepId) || this.steps.get(this._currentStepId)?.flow_id;
    // Basic route validation
    for (const step of this.steps.values()) {
      for (const r of step.routes) {
        if (!this.steps.has(r.target)) {
          throw new Error(`Route from '${step.step_id}' targets missing step '${r.target}'`);
        }
      }
    }
  }

  get currentStepId(): string {
    return this._currentStepId;
  }

  set currentStepId(id: string) {
    if (!this.steps.has(id)) throw new Error(`Step '${id}' not found`);
    const prevFlow = this._currentFlowId;
    const nextFlow = this.stepToFlow.get(id) || this.steps.get(id)?.flow_id;
    // Validate flow entry/exit against flow configs if present
    if (prevFlow !== nextFlow) {
      if (nextFlow) {
        const fc = this.flowConfig.get(nextFlow);
        if (fc?.enters && fc.enters.length > 0 && !fc.enters.includes(id)) {
          throw new Error(
            `Cannot enter flow '${nextFlow}' at step '${id}'. Allowed entries: ${fc.enters.join(', ')}`,
          );
        }
      }
      if (prevFlow) {
        const pc = this.flowConfig.get(prevFlow);
        // Exits list denotes target steps that mark a valid exit
        if (pc?.exits && pc.exits.length > 0 && !pc.exits.includes(id)) {
          throw new Error(
            `Cannot exit flow '${prevFlow}' to step '${id}'. Allowed exits: ${pc.exits.join(', ')}`,
          );
        }
      }
    }
    // update ids
    this._prevStepId = this._currentStepId;
    this._currentStepId = id;
    this._currentFlowId = nextFlow;
    if (prevFlow !== nextFlow) {
      this._lastFlowTransition = { from: prevFlow, to: nextFlow };
    }
    // flow transitions can be observed by caller via getters
  }

  get currentStep(): Step {
    const step = this.steps.get(this._currentStepId);
    if (!step) throw new Error(`Step '${this._currentStepId}' not found`);
    return step;
  }

  hasRouteTo(target: string): boolean {
    const s = this.currentStep;
    return s.routes.some((r) => r.target === target);
  }

  get currentFlowId(): string | undefined {
    return this._currentFlowId;
  }

  // Flow helpers (no-op for now; kept for future expansion)
  enterFlow(flowId: string | undefined) {
    this._currentFlowId = flowId;
  }

  exitFlow() {
    this._currentFlowId = undefined;
  }

  consumeFlowTransition(): { from?: string; to?: string } | undefined {
    const t = this._lastFlowTransition;
    this._lastFlowTransition = undefined;
    return t;
  }

  // Initialize from a previously saved state without validating flow entry/exit
  loadFromState(stepId: string, flowId?: string) {
    if (!this.steps.has(stepId)) throw new Error(`Step '${stepId}' not found`);
    this._prevStepId = undefined;
    this._currentStepId = stepId;
    this._currentFlowId =
      flowId ?? (this.stepToFlow.get(stepId) || this.steps.get(stepId)?.flow_id);
    this._lastFlowTransition = undefined;
  }
}
