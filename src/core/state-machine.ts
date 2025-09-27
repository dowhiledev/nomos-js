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

  constructor(config: StateMachineConfig) {
    this.steps = config.steps;
    this.flows = config.flows;
    if (!this.steps.has(config.startStepId)) {
      throw new Error(`Start step '${config.startStepId}' not found`);
    }
    this._currentStepId = config.startStepId;
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
    this._currentStepId = id;
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
}

