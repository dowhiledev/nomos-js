import { StepSchema } from '../models/schemas';
import type { Step, Flow, AgentConfig, State, Response } from '../models/schemas';
import type { LLMBase } from '../llms';
import type { DecisionConstraints } from '../models/schemas';
import type { Tool } from '../tools';
import { Session } from './session';
import type { MemoryAdapter } from '../memory';
import type { EventEmitter } from './events';

// Agent configuration
export interface AgentOptions {
  name: string;
  steps: Step[];
  startStepId: string;
  persona?: string;
  systemMessage?: string;
  tools?: Tool[];
  flows?: Flow[];
  showStepsDesc?: boolean;
  maxErrors?: number;
  maxIter?: number;
  llm: LLMBase;
  embeddingModel?: LLMBase;
  memoryAdapter?: MemoryAdapter;
  summarizeEvery?: number;
  eventEmitter?: EventEmitter;
}

// Main Agent class
export class Agent {
  public readonly name: string;
  private steps: Map<string, Step>;
  private startStepId: string;
  private persona?: string;
  private systemMessage?: string;
  private tools: Map<string, Tool>;
  private flows?: Flow[];
  private showStepsDesc: boolean;
  private maxErrors: number;
  private maxIter: number;
  private llm: LLMBase;
  private embeddingModel: LLMBase;
  private memoryAdapter?: MemoryAdapter;
  private summarizeEvery?: number;
  private eventEmitter?: EventEmitter;
  private stateAdapter?: import('../memory').StateAdapter;

  constructor(options: AgentOptions) {
    this.name = options.name;
    // Normalize steps to ensure defaults (routes/available_tools) are present
    const normalizedSteps = options.steps.map((s: any) => StepSchema.parse(s));
    this.steps = new Map(normalizedSteps.map((step: any) => [step.step_id, step]));
    this.startStepId = options.startStepId;
    this.persona = options.persona;
    this.systemMessage = options.systemMessage;
    this.tools = new Map((options.tools || []).map((tool) => [tool.name, tool]));
    this.flows = options.flows;
    this.showStepsDesc = options.showStepsDesc || false;
    this.maxErrors = options.maxErrors || 3;
    this.maxIter = options.maxIter || 5;
    this.llm = options.llm;
    this.embeddingModel = options.embeddingModel || options.llm;
    this.memoryAdapter = options.memoryAdapter;
    this.summarizeEvery = options.summarizeEvery;
    this.eventEmitter = options.eventEmitter;
    this.stateAdapter = (options as any).stateAdapter;

    this.validateConfiguration();
  }

  // Create agent from configuration object
  static fromConfig(config: AgentConfig, llm: LLMBase, tools: Tool[] = []): Agent {
    return new Agent({
      name: config.name,
      steps: config.steps,
      startStepId: config.start_step_id,
      persona: config.persona,
      systemMessage: config.system_message,
      tools,
      flows: config.flows,
      showStepsDesc: config.show_steps_desc,
      maxErrors: config.max_errors,
      maxIter: config.max_iter,
      llm,
      embeddingModel: config.embedding_model as LLMBase,
    });
  }

  // Validate agent configuration
  private validateConfiguration(): void {
    // Check start step exists
    if (!this.steps.has(this.startStepId)) {
      throw new Error(`Start step '${this.startStepId}' not found in steps`);
    }

    // Validate step routes
    for (const step of this.steps.values()) {
      for (const route of step.routes) {
        if (!this.steps.has(route.target)) {
          throw new Error(`Step '${step.step_id}' has invalid route target '${route.target}'`);
        }
      }

      // Validate available tools
      for (const toolName of step.available_tools) {
        if (!this.tools.has(toolName)) {
          throw new Error(`Step '${step.step_id}' references unknown tool '${toolName}'`);
        }
      }
    }
  }

  // Create a new session
  createSession(state?: State): Session {
    return new Session({
      name: this.name,
      llm: this.llm,
      embeddingModel: this.embeddingModel,
      steps: this.steps,
      startStepId: this.startStepId,
      tools: this.tools,
      systemMessage: this.systemMessage,
      persona: this.persona,
      flows: this.flows,
      showStepsDesc: this.showStepsDesc,
      maxErrors: this.maxErrors,
      maxIter: this.maxIter,
      state,
      memoryAdapter: this.memoryAdapter,
      summarizeEvery: this.summarizeEvery,
      eventEmitter: this.eventEmitter,
      stateAdapter: this.stateAdapter,
    });
  }

  // Process user input and advance session
  async next(
    userInput?: string,
    sessionData?: State,
    returnTool: boolean = false,
    returnStep: boolean = false,
    verbose: boolean = false,
    constraints?: DecisionConstraints,
    chainMoves: boolean = false,
  ): Promise<Response> {
    const session = sessionData ? this.createSession(sessionData) : this.createSession();

    return session.next(userInput, returnTool, returnStep, verbose, constraints, chainMoves);
  }

  // Stream decisions (partial + final)
  streamNext(
    userInput?: string,
    sessionData?: State,
    returnTool: boolean = false,
    returnStep: boolean = false,
    verbose: boolean = false,
    constraints?: DecisionConstraints,
    chainMoves: boolean = false,
  ): AsyncIterable<{
    type: 'partial' | 'final';
    decision?: Response['decision'];
    response?: Response;
  }> {
    const session = sessionData ? this.createSession(sessionData) : this.createSession();
    return session.streamNext(userInput, returnTool, returnStep, verbose, constraints, chainMoves);
  }

  // Restore a session from adapter history + provided current step id
  async restoreSessionFromAdapter(sessionId: string, currentStepId: string): Promise<Session> {
    // Load from configured memoryAdapter
    if (!this['memoryAdapter']) {
      throw new Error(
        'No memoryAdapter configured on Agent. Provide one to use restoreSessionFromAdapter.',
      );
    }
    const history = await (this as any).memoryAdapter.load(sessionId);
    return this.createSession({ session_id: sessionId, current_step_id: currentStepId, history });
  }

  async saveState(state: State): Promise<void> {
    if (!(this as any).stateAdapter) throw new Error('No stateAdapter configured on Agent.');
    await (this as any).stateAdapter.saveState(state.session_id, state);
  }

  async loadState(sessionId: string): Promise<State | null> {
    if (!(this as any).stateAdapter) throw new Error('No stateAdapter configured on Agent.');
    return (this as any).stateAdapter.loadState(sessionId);
  }

  // Get agent configuration
  getConfig(): AgentConfig {
    return {
      name: this.name,
      steps: Array.from(this.steps.values()),
      start_step_id: this.startStepId,
      system_message: this.systemMessage,
      persona: this.persona,
      show_steps_desc: this.showStepsDesc,
      max_errors: this.maxErrors,
      max_iter: this.maxIter,
      flows: this.flows,
    };
  }

  // Add a tool to the agent
  addTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  // Remove a tool from the agent
  removeTool(toolName: string): boolean {
    return this.tools.delete(toolName);
  }

  // Get available tools
  getTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  // Add a step to the agent
  addStep(step: Step): void {
    // Validate the step
    for (const route of step.routes) {
      if (!this.steps.has(route.target)) {
        throw new Error(`Step '${step.step_id}' has invalid route target '${route.target}'`);
      }
    }

    for (const toolName of step.available_tools) {
      if (!this.tools.has(toolName)) {
        throw new Error(`Step '${step.step_id}' references unknown tool '${toolName}'`);
      }
    }

    this.steps.set(step.step_id, step);
  }

  // Remove a step from the agent
  removeStep(stepId: string): boolean {
    if (stepId === this.startStepId) {
      throw new Error('Cannot remove the start step');
    }
    return this.steps.delete(stepId);
  }

  // Get available steps
  getSteps(): Step[] {
    return Array.from(this.steps.values());
  }
}
