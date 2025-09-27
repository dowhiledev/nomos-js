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

  constructor(config: StateMachineConfig) {
    this.steps = config.steps;
    this.flows = config.flows;
    if (!this.steps.has(config.startStepId)) {
      throw new Error(`Start step '${config.startStepId}' not found`);
    }
    this._currentStepId = config.startStepId;
    this._currentFlowId = this.steps.get(this._currentStepId)?.flow_id;
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
    const nextFlow = this.steps.get(id)?.flow_id;
    // update ids
    this._currentStepId = id;
    this._currentFlowId = nextFlow;
    // flow transitions can be observed by caller via getters
  }

  get currentStep(): Step {
    const step = this.steps.get(this._currentStepId);
    if (!step) throw new Error(`Step '${this._currentStepId}' not found`);
    return step;
  }

  hasRouteTo(target: string): boolean {
    const s = this.currentStep;
    return s.routes.some(r => r.target === target);
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
}
