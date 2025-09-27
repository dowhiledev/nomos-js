import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import type {
  State,
  Step,
  Flow,
  Response,
  Decision,
  Message,
  Summary,
  StepIdentifier,
  Event,
} from '../models/schemas';
import type { LLMBase } from '../llms';
import type { Tool } from '../tools';
import type { DecisionConstraints } from '../models/schemas';
import { StateMachine } from './state-machine';
import { Memory } from '../memory';
import type { EventEmitter } from './events';

// Session configuration
export interface SessionConfig {
  name: string;
  llm: LLMBase;
  embeddingModel: LLMBase;
  steps: Map<string, Step>;
  startStepId: string;
  tools: Map<string, Tool>;
  systemMessage?: string;
  persona?: string;
  flows?: Flow[];
  showStepsDesc?: boolean;
  maxErrors?: number;
  maxIter?: number;
  state?: State;
  memoryAdapter?: import('../memory').MemoryAdapter;
  summarizeEvery?: number;
  eventEmitter?: EventEmitter;
  stateAdapter?: import('../memory').StateAdapter;
}

// Session class for managing agent conversations
export class Session {
  public readonly sessionId: string;
  public readonly name: string;
  private llm: LLMBase;
  private embeddingModel: LLMBase;
  private steps: Map<string, Step>;
  private startStepId: string;
  private tools: Map<string, Tool>;
  private systemMessage?: string;
  private persona?: string;
  private flows?: Flow[];
  private showStepsDesc: boolean;
  private maxErrors: number;
  private maxIter: number;
  private eventEmitter?: EventEmitter;
  private stateAdapter?: import('../memory').StateAdapter;

  // Runtime state
  private stateMachine: StateMachine;
  private memory: Memory;
  private errorCount: number = 0;
  private iterationCount: number = 0;
  private flowEntryStepId?: string;

  constructor(config: SessionConfig) {
    this.sessionId = config.state?.session_id || `${config.name}_${uuidv4()}`;
    this.name = config.name;
    this.llm = config.llm;
    this.embeddingModel = config.embeddingModel;
    this.steps = config.steps;
    this.startStepId = config.startStepId;
    this.tools = config.tools;
    this.systemMessage = config.systemMessage;
    this.persona = config.persona;
    this.flows = config.flows;
    this.showStepsDesc = config.showStepsDesc || false;
    this.maxErrors = config.maxErrors || 3;
    this.maxIter = config.maxIter || 5;

    // Initialize state machine and memory
    this.stateMachine = new StateMachine({ steps: this.steps, startStepId: this.startStepId, flows: this.flows });
    if (config.state?.current_step_id) {
      const flowId = (config.state as any).flow_state?.flow_id as string | undefined;
      this.stateMachine.loadFromState(config.state.current_step_id, flowId);
    }
    this.memory = new Memory(config.state?.history, { adapter: config.memoryAdapter, summarizeEvery: config.summarizeEvery });
    this.eventEmitter = config.eventEmitter;
    this.stateAdapter = config.stateAdapter;
  }

  get currentStep(): Step {
    return this.stateMachine.currentStep;
  }

  // Get current session state
  getState(): State {
    const base: State = {
      session_id: this.sessionId,
      current_step_id: this.stateMachine.currentStepId,
      history: this.memory.getHistory(),
    } as any;
    const cf = this.stateMachine.currentFlowId;
    if (cf) {
      const ctx = this.memory.getFlowContext(cf) || { metadata: {}, variables: {} };
      (base as any).flow_state = {
        flow_id: cf,
        flow_context: {
          flow_id: cf,
          entry_step: this.flowEntryStepId,
          current_step_id: this.stateMachine.currentStepId,
          variables: ctx.variables,
          metadata: ctx.metadata,
          previous_context: this.computePreviousContext(),
        },
        flow_memory_context: this.memory.getFlowHistory(cf),
      };
    }
    return base;
  }

  private computePreviousContext(): Array<Message | Summary> {
    const hist = this.memory.getHistory();
    const prev = hist.filter(i => ('type' in i) || ('summary' in i)).slice(-5) as Array<Message | Summary>;
    return prev;
  }

  // Execute a tool
  private async runTool(toolName: string, args: Record<string, any>): Promise<any> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool '${toolName}' not found`);
    }

    const result = await tool.run(args);
    if (!result.success) {
      throw new Error(`Tool execution failed: ${result.error}`);
    }

    return result.result;
  }

  // Generate decision using LLM
  private async generateDecision(
    userInput: string,
    context: string,
    constraints?: DecisionConstraints,
  ): Promise<Decision> {
    const step = this.currentStep;

    // Prepare few-shot examples (dynamic by similarity)
    let examplesText = '';
    if ((step as any).examples && (step as any).examples.length > 0) {
      try {
        const contexts = (step as any).examples.map((e: any) => e.context as string);
        const currentEmb = await this.embeddingModel.embedText(context);
        const exEmbeddings = await this.embeddingModel.embedBatch(contexts);
        // cosine similarity
        const sims: number[] = exEmbeddings.map((emb: number[]) => cosineSimilarity(currentEmb, emb));
        const pairs: Array<{ ex: any; sim: number }> = (step as any).examples.map((ex: any, i: number) => ({ ex, sim: sims[i] }));
        pairs.sort((a: { ex: any; sim: number }, b: { ex: any; sim: number }) => b.sim - a.sim);
        const max = 3;
        const threshold = 0.5;
        const picked = pairs.filter((p: { ex: any; sim: number }) => p.sim >= threshold).slice(0, max);
        if (picked.length > 0) {
          examplesText += 'Examples (context -> decision):\n';
          for (const { ex } of picked) {
            const decisionTxt = typeof ex.decision === 'string' ? ex.decision : JSON.stringify(ex.decision);
            examplesText += `- ${ex.context} -> ${decisionTxt}\n`;
          }
          examplesText += '\n';
        }
      } catch {}
    }

    // Build prompt for decision making
    const prompt = this.buildDecisionPrompt(userInput, context, step, constraints, examplesText);

    // Build constrained schema if needed
    const { DecisionSchema } = await import('../models/schemas');
    let schema = DecisionSchema as any;
    if (constraints?.actions && constraints.actions.length > 0) {
      schema = schema.refine((d: any) => constraints.actions!.includes(d.action), {
        message: `action must be one of: ${constraints.actions.join(', ')}`,
      });
    }

    try {
      const decision = await this.llm.generateObject(schema as any, {
        prompt,
        options: { temperature: 0.1 },
      });
      return decision as Decision;
    } catch (err) {
      // Fallback to text + parse
      const response = await this.llm.generateText(prompt, { temperature: 0.1 });
      return this.parseDecision(response);
    }
  }

  // Build decision prompt
  private buildDecisionPrompt(
    userInput: string,
    context: string,
    step: Step,
    constraints?: DecisionConstraints,
    examplesText: string = '',
  ): string {
    let prompt = '';

    // System message and persona
    if (this.systemMessage) {
      prompt += `System: ${this.systemMessage}\n\n`;
    }

    if (this.persona) {
      prompt += `Persona: ${this.persona}\n\n`;
    }

    // Current step information
    prompt += `Current Step: ${step.step_id}\n`;
    prompt += `Description: ${step.description}\n\n`;

    // Available routes
    if (step.routes.length > 0) {
      prompt += 'Available Routes:\n';
      step.routes.forEach(route => {
        prompt += `- If ${route.condition}, go to ${route.target}\n`;
      });
      prompt += '\n';
    }

    // Available tools
    if (step.available_tools.length > 0) {
      prompt += 'Available Tools:\n';
      step.available_tools.forEach(toolName => {
        const tool = this.tools.get(toolName);
        if (tool) {
          prompt += `- ${tool.name}: ${tool.description}\n`;
        }
      });
      prompt += '\n';
    }

    // Context and history
    prompt += `Context: ${context}\n\n`;
    prompt += `User Input: ${userInput}\n\n`;

    // Few-shot examples
    if (examplesText) {
      prompt += examplesText;
    }

    // Instructions (Python order)
    prompt += `Based on the current step, user input, and available options, decide what to do next.
Respond with a JSON object containing (in this order):
- "reasoning": array of short strings explaining your thought process
- "action": "RESPOND", "TOOL_CALL", "MOVE", or "END"
- "response": text response (for RESPOND action)
- "suggestions": array of quick reply suggestions (optional, for RESPOND)
- "step_id": step_id to move to (for MOVE action)
- "tool_call": { "tool_name": string, "tool_kwargs": object } (for TOOL_CALL action)

Action Types:
- RESPOND: Provide information or ask for clarification
- TOOL_CALL: Use a tool to gather information or perform an action
- MOVE: Transition to another step
- END: End the conversation`;

    prompt += `\n\nWhen using TOOL_CALL, infer required arguments from the latest user message and context, and include all required keys in tool_call.tool_kwargs. Do not omit required parameters.`;

    if (constraints?.actions && constraints.actions.length > 0) {
      prompt += `\n\nAllowed actions in this response: ${constraints.actions.join(', ')}.`;
    }
    if (constraints?.fields && constraints.fields.length > 0) {
      prompt += `\nOnly include these fields in the JSON: ${constraints.fields.join(', ')}.`;
    }
    if (constraints?.tool_name) {
      prompt += `\nIf you use TOOL_CALL, you MUST call the tool '${constraints.tool_name}'.`;
    }
    if (constraints?.required_args && constraints.required_args.length > 0) {
      prompt += `\nInclude these keys in tool_call.tool_kwargs: ${constraints.required_args.join(', ')}.`;
    }

    return prompt;
  }

  // Parse decision from LLM response
  private parseDecision(response: string): Decision {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const raw = JSON.parse(jsonMatch[0]);
      const step_id = raw.step_id ?? raw.target;
      const tool_call = raw.tool_call ?? (raw.tool_name ? { tool_name: raw.tool_name, tool_kwargs: raw.tool_args ?? {} } : undefined);
      const reasoning = Array.isArray(raw.reasoning) ? raw.reasoning : (raw.reasoning ? [raw.reasoning] : undefined);
      return { action: raw.action, step_id, response: raw.response, tool_call, reasoning } as Decision;
    } catch (error) {
      // Fallback decision
      return {
        action: 'RESPOND',
        response: 'I apologize, but I had trouble understanding how to proceed. Could you please rephrase your request?',
        reasoning: 'Failed to parse LLM decision, using fallback',
      };
    }
  }

  // Main execution method
  async next(
    userInput?: string,
    returnTool: boolean = false,
    returnStep: boolean = false,
    verbose: boolean = false,
    constraints?: DecisionConstraints,
  ): Promise<Response> {
    this.iterationCount++;

    if (this.iterationCount > this.maxIter) {
      return this.createResponse(
        'I apologize, but I\'ve reached the maximum number of iterations. Please start a new conversation.',
        'END'
      );
    }

    try {
      // Record user input into history for context
      if (userInput && userInput.trim().length > 0) {
        this.memory.addMessage('user', userInput);
        const cf = this.stateMachine.currentFlowId;
        if (cf) this.memory.addFlowEvent(cf, 'message', `user: ${userInput}`);
      }
      // Generate + auto-advance on MOVE/TOOL_CALL with null input
      let context = this.buildContext();
      let decision = await this.generateDecision(userInput || '', context, constraints);
      decision = await this.ensureValidDecision(decision, userInput || '', context);

      let finalRes: Response | null = null;
      let lastToolOutput: string | null = null;
      let safety = 0;
      while (true) {
        // Emit decision before execution for correct event ordering
        this.emitEvent('decision', { decision: this.canonicalizeDecision(decision) });
        const exec = await this.executeDecision(this.normalizeDecision(decision), returnTool, returnStep, verbose);
        finalRes = exec;
        if (exec.tool_output) lastToolOutput = exec.tool_output;

        if (decision.action === 'MOVE' || decision.action === 'TOOL_CALL') {
          if (++safety >= this.maxIter) break;
          context = this.buildContext();
          let next = await this.generateDecision('', context, constraints);
          next = await this.ensureValidDecision(next, '', context);
          decision = next;
          continue;
        }
        break;
      }

      if (!finalRes) return this.createResponse('No response generated', 'RESPOND');
      if (lastToolOutput && returnTool) finalRes.tool_output = lastToolOutput;
      if (verbose) finalRes.decision = this.canonicalizeDecision(decision);
      if (!finalRes.response) {
        const desc = this.currentStep.description || 'Please continue.';
        finalRes.response = desc;
        this.memory.addMessage('assistant', finalRes.response);
      }
      return finalRes;
    } catch (error) {
      this.errorCount++;

      if (this.errorCount >= this.maxErrors) {
        return this.createResponse(
          'I apologize, but I\'ve encountered too many errors. Please start a new conversation.',
          'END'
        );
      }

      return this.createResponse(
        'I apologize, but I encountered an error. Let me try again.',
        'RESPOND'
      );
    }
  }

  // Build context from history
  private buildContext(): string {
    // Simple context building - could be enhanced with summarization
    const recentMessages = this.memory.getHistory().slice(-5); // Last 5 items
    return recentMessages
      .map(item => {
        if ('role' in item) {
          return `${item.role}: ${item.content}`;
        } else if ('summary' in item) {
          return `Summary: ${item.summary.join(' ')}`;
        } else if ('type' in item) {
          return `Event[${item.type}]: ${'content' in item ? (item as any).content : ''}`;
        } else {
          return `Step: ${item.step_id}`;
        }
      })
      .join('\n');
  }

  // Execute decision
  private async executeDecision(
    decision: Decision,
    returnTool: boolean,
    returnStep: boolean,
    verbose: boolean
  ): Promise<Response> {
    let toolOutput: string | null = null;

    const target = (decision as any).target ?? decision.step_id;
    const toolName = (decision as any).tool_name ?? decision.tool_call?.tool_name;
    const toolArgs = (decision as any).tool_args ?? decision.tool_call?.tool_kwargs;

    switch (decision.action) {
      case 'TOOL_CALL':
        if (toolName) {
          try {
            const result = await this.runTool(toolName, toolArgs || {});
            toolOutput = JSON.stringify(result);

            // Add tool result to history
            this.memory.addMessage('tool', `Tool ${toolName} result: ${toolOutput}`);
            const cf = this.stateMachine.currentFlowId;
            if (cf) this.memory.addFlowEvent(cf, 'tool', `Tool ${toolName} result: ${toolOutput}`);
            this.emitEvent('tool_called', { tool_name: toolName, tool_args: toolArgs, result });

            // Provide helpful, concise assistant responses for common tool results when the model omitted one
            if (!decision.response) {
              try {
                const parsed = typeof result === 'string' ? JSON.parse(result) : result;
                if (toolName === 'get_order_summary') {
                  const lines = Array.isArray(parsed?.summary) ? parsed.summary : [];
                  const total = parsed?.total;
                  const summaryText = lines.length ? `\n- ${lines.join('\n- ')}` : '';
                  decision.response = `Here is your order summary:${summaryText}${typeof total === 'number' ? `\nTotal: $${total.toFixed(2)}.` : ''} Would you like to pay by Card or Cash, or make changes?`;
                } else if (toolName === 'finalize_order') {
                  decision.response = parsed?.message || 'Your order has been finalized. Thank you!';
                } else if (toolName === 'add_to_cart' || toolName === 'remove_item' || toolName === 'clear_cart') {
                  if (parsed?.message) decision.response = parsed.message;
                }
              } catch {
                // ignore parse errors; model can handle follow-up
              }
            }
          } catch (error) {
            toolOutput = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
            // Avoid noisy auto-response; model can handle error messaging on next turn
            this.emitEvent('tool_error', { tool_name: toolName, tool_args: toolArgs, error: String(error) });
          }
        }
        break;

      case 'MOVE':
        if (target) {
          this.stateMachine.currentStepId = target;
          this.memory.addStep(target);
          const trans = this.stateMachine.consumeFlowTransition();
          if (trans) {
            if (trans.from && trans.from !== trans.to) {
              this.memory.addFlowEvent(trans.from, 'flow_exit', `Exit flow ${trans.from}`);
              this.emitEvent('flow_exit', { flow_id: trans.from });
              this.flowEntryStepId = undefined;
            }
            if (trans.to && trans.to !== trans.from) {
              this.memory.addFlowEvent(trans.to, 'flow_enter', `Enter flow ${trans.to}`);
              this.emitEvent('flow_enter', { flow_id: trans.to });
              this.flowEntryStepId = target;
            }
            const cf = this.stateMachine.currentFlowId;
            if (cf) this.memory.addFlowStep(cf, target);
          }
          this.emitEvent('step_move', { to: target });
        }
        break;

      case 'END':
        // Conversation ended
        break;
    }

    // Add user input to history if provided
    if (decision.response) {
      this.memory.addMessage('assistant', decision.response);
      const cf = this.stateMachine.currentFlowId;
      if (cf) this.memory.addFlowEvent(cf, 'message', `assistant: ${decision.response}`);
    }

    const result = {
      response: decision.response || null,
      tool_output: returnTool ? toolOutput : null,
      state: this.getState(),
      decision: verbose ? decision : undefined,
    } as Response;
    // Persist memory if adapter is set
    await this.memory.persist(this.sessionId);
    return result;
  }

  private emitEvent(type: string, data?: any, decision?: any) {
    try {
      if (!this.eventEmitter) return;
      this.eventEmitter.emit({ sessionId: this.sessionId, type, data, decision, timestamp: new Date() });
    } catch {
      // swallow emitter errors
    }
  }

  // Create response helper
  private createResponse(
    response: string,
    action: 'RESPOND' | 'END' = 'RESPOND'
  ): Response {
    if (action === 'RESPOND') {
      this.memory.addMessage('assistant', response);
    }

    return {
      response,
      tool_output: null,
      state: this.getState(),
    };
  }

  // Ensure the decision is valid for the current step; otherwise retry with RESPOND constraint
  private async ensureValidDecision(decision: Decision, userInput: string, context: string): Promise<Decision> {
    const step = this.currentStep;
    const availableRouteTargets = new Set(step.routes.map(r => r.target));
    const availableToolNames = new Set(step.available_tools);

    // Invalid MOVE: missing or unknown target
    if (decision.action === 'MOVE') {
      const target = (decision as any).target ?? decision.step_id;
      if (!target || !availableRouteTargets.has(target)) {
        return await this.generateDecision(userInput, context, { actions: ['RESPOND'], fields: ['response', 'reasoning'] });
      }
    }

    // Invalid TOOL_CALL: missing or unavailable tool
    if (decision.action === 'TOOL_CALL') {
      const name = (decision as any).tool_name ?? decision.tool_call?.tool_name;
      if (!name || !availableToolNames.has(name) || !this.tools.has(name)) {
        return await this.generateDecision(userInput, context, { actions: ['RESPOND'], fields: ['response', 'reasoning'] });
      }

      // Validate arguments against tool schema; guide retry if missing
      const tool = this.tools.get(name)!;
      const args = (decision as any).tool_args ?? decision.tool_call?.tool_kwargs ?? {};
      const missing = this.getMissingArgs(tool.parameters, args);
      if (missing.length > 0) {
        return await this.generateDecision(userInput, context, {
          actions: ['TOOL_CALL'],
          tool_name: name,
          required_args: missing,
          fields: ['tool_call', 'reasoning'],
        });
      }
    }

    return decision;
  }

  // Compute missing required argument keys for a tool's parameter schema
  private getMissingArgs(schema: any, args: Record<string, any>): string[] {
    try {
      // If object schema, infer required keys by parsing an empty object and collecting missing field errors
      const res = (schema as any).safeParse ? (schema as any).safeParse(args) : { success: true };
      if (res.success) return [];
      const issues = res.error?.issues || [];
      const missing = new Set<string>();
      for (const issue of issues) {
        // Path like ['text'] for missing required key
        const key = Array.isArray(issue.path) && issue.path.length ? String(issue.path[0]) : undefined;
        if (key) missing.add(key);
      }
      return Array.from(missing);
    } catch {
      return [];
    }
  }

  // Stream a decision (partial objects) and yield final response at the end
  async *streamNext(
    userInput?: string,
    returnTool: boolean = false,
    returnStep: boolean = false,
    verbose: boolean = false,
    constraints?: DecisionConstraints,
  ): AsyncIterable<{ type: 'partial' | 'final'; decision?: Decision; response?: Response; response_chunk?: string; tool_call?: { tool_name: string; tool_args: Record<string, any> } }> {
    this.iterationCount++;
    if (this.iterationCount > this.maxIter) {
      yield { type: 'final', response: this.createResponse(
        'I apologize, but I\'ve reached the maximum number of iterations. Please start a new conversation.',
        'END'
      ) };
      return;
    }

    try {
      const step = this.currentStep;
      // Build examples and prompt as in generateDecision
      let examplesText = '';
      if ((step as any).examples && (step as any).examples.length > 0) {
        try {
          const contexts = (step as any).examples.map((e: any) => e.context as string);
          const currentEmb = await this.embeddingModel.embedText(this.buildContext());
          const exEmbeddings = await this.embeddingModel.embedBatch(contexts);
          const sims: number[] = exEmbeddings.map((emb: number[]) => cosineSimilarity(currentEmb, emb));
          const pairs: Array<{ ex: any; sim: number }> = (step as any).examples.map((ex: any, i: number) => ({ ex, sim: sims[i] }));
          pairs.sort((a, b) => b.sim - a.sim);
          const picked = pairs.filter((p) => p.sim >= 0.5).slice(0, 3);
          if (picked.length > 0) {
            examplesText += 'Examples (context -> decision):\n';
            for (const { ex } of picked) {
              const decisionTxt = typeof ex.decision === 'string' ? ex.decision : JSON.stringify(ex.decision);
              examplesText += `- ${ex.context} -> ${decisionTxt}\n`;
            }
            examplesText += '\n';
          }
        } catch {}
      }

      const prompt = this.buildDecisionPrompt(userInput || '', this.buildContext(), step, constraints, examplesText);
      const { DecisionSchema } = await import('../models/schemas');
      let schema = DecisionSchema as any;
      if (constraints?.actions && constraints.actions.length > 0) {
        schema = schema.refine((d: any) => constraints.actions!.includes(d.action), {
          message: `action must be one of: ${constraints.actions.join(', ')}`,
        });
      }

      // Stream structured object with partial updates
      const { partialStream, final } = await this.llm.streamObject(schema, { prompt, options: { temperature: 0.1 } }) as any;
      let lastResponseText = '';
      let toolAnnounced = false;
      let actionAnnounced = false;
      let reasoningCount = 0;
      for await (const partial of partialStream) {
        const p = this.normalizeDecision(partial as any);
        // Emit action once
        if (p.action && !actionAnnounced) {
          actionAnnounced = true;
          yield { type: 'partial', decision: this.canonicalizeDecision({ action: p.action } as any) };
        }
        // Announce tool call before execution
        if (!toolAnnounced && (p as any).tool_call?.tool_name) {
          toolAnnounced = true;
          yield { type: 'partial', tool_call: { tool_name: (p as any).tool_call.tool_name, tool_args: (p as any).tool_call.tool_kwargs || {} } };
        }
        // Stream reasoning lines as they become available
        if (Array.isArray((p as any).reasoning) && (p as any).reasoning.length > reasoningCount) {
          reasoningCount = (p as any).reasoning.length;
          yield { type: 'partial', decision: this.canonicalizeDecision({ reasoning: (p as any).reasoning } as any) };
        }
        // Stream response chunks only for RESPOND action
        if (p.action === 'RESPOND' && typeof (p as any).response === 'string') {
          const txt = String((p as any).response);
          if (txt.length > lastResponseText.length) {
            const delta = txt.slice(lastResponseText.length);
            lastResponseText = txt;
            if (delta) yield { type: 'partial', response_chunk: delta };
          }
        }
      }
      // Final decision
      let finalDecision: Decision = await final as any;
      finalDecision = this.normalizeDecision(finalDecision);
      // Validate/correct final decision before execution (fills missing tool args, etc.)
      const validated = await this.ensureValidDecision(finalDecision, userInput || '', this.buildContext());
      // If decision is TOOL_CALL and we now have concrete args after validation, surface them before execution
      if ((validated as any).action === 'TOOL_CALL') {
        const tn = (validated as any).tool_name ?? (validated as any).tool_call?.tool_name;
        const ta = (validated as any).tool_args ?? (validated as any).tool_call?.tool_kwargs ?? {};
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const self: any = this;
          if (tn) {
            // Emit via stream by yielding a partial tool_call update
            // Note: This yield is within an async generator
            // @ts-ignore - yielding within method
            yield { type: 'partial', tool_call: { tool_name: tn, tool_args: ta } };
          }
        } catch {}
      }
      // Execute after announcing tool call
      const finalResponse = await this.executeDecision(this.normalizeDecision(validated), returnTool, returnStep, verbose);
      yield { type: 'final', decision: verbose ? finalDecision : undefined, response: finalResponse };
    } catch (error) {
      this.errorCount++;
      if (this.errorCount >= this.maxErrors) {
        yield { type: 'final', response: this.createResponse(
          'I apologize, but I\'ve encountered too many errors. Please start a new conversation.',
          'END'
        ) };
        return;
      }
      yield { type: 'final', response: this.createResponse(
        'I apologize, but I encountered an error. Let me try again.',
        'RESPOND'
      ) };
    }
  }

  private normalizeDecision(d: Decision): Decision {
    const dd: any = { ...d };
    if (!dd.target && dd.step_id) dd.target = dd.step_id;
    if (!dd.tool_name && dd.tool_call?.tool_name) {
      dd.tool_name = dd.tool_call.tool_name;
      dd.tool_args = dd.tool_call.tool_kwargs;
    }
    return dd as Decision;
  }

  private canonicalizeDecision(d: Decision): Decision {
    // Ensure Python parity ordering and nullability for printing and return
    const reasoning = d.reasoning
      ? Array.isArray(d.reasoning)
        ? d.reasoning
        : [d.reasoning as any]
      : null;
    const action = d.action;
    const response = (d as any).response ?? null;
    const suggestions = (d as any).suggestions ?? null;
    const step_id = (d as any).step_id ?? null;
    const tool_call = (d as any).tool_call ?? null;
    // Construct in the exact field order
    const ordered: any = { reasoning, action, response, suggestions, step_id, tool_call };
    return ordered as Decision;
  }
}

// Utilities
function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}
