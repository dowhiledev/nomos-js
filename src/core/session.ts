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

  // Runtime state
  private currentStepId: string;
  private history: Array<Message | Summary | StepIdentifier | Event> = [];
  private errorCount: number = 0;
  private iterationCount: number = 0;

  constructor(config: SessionConfig) {
    this.sessionId = config.state?.session_id || `${config.name}_${uuidv4()}`;
    this.name = config.name;
    this.llm = config.llm;
    this.embeddingModel = config.embeddingModel;
    this.steps = new Map(Object.entries(config.steps));
    this.startStepId = config.startStepId;
    this.tools = new Map(Object.entries(config.tools));
    this.systemMessage = config.systemMessage;
    this.persona = config.persona;
    this.flows = config.flows;
    this.showStepsDesc = config.showStepsDesc || false;
    this.maxErrors = config.maxErrors || 3;
    this.maxIter = config.maxIter || 5;

    // Initialize state
    if (config.state) {
      this.currentStepId = config.state.current_step_id;
      this.history = config.state.history;
    } else {
      this.currentStepId = this.startStepId;
    }
  }

  get currentStep(): Step {
    const step = this.steps.get(this.currentStepId);
    if (!step) {
      throw new Error(`Step ${this.currentStepId} not found`);
    }
    return step;
  }

  // Get current session state
  getState(): State {
    return {
      session_id: this.sessionId,
      current_step_id: this.currentStepId,
      history: this.history,
      // flow_state: // TODO: Implement flow state
    };
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

    // Instructions
    prompt += `Based on the current step, user input, and available options, decide what to do next.
Respond with a JSON object containing:
- "action": "RESPOND", "TOOL_CALL", "MOVE", or "END"
- "target": step_id to move to (for MOVE action)
- "response": text response (for RESPOND action)
- "tool_name": tool to call (for TOOL_CALL action)
- "tool_args": arguments for tool (for TOOL_CALL action)
- "reasoning": brief explanation of the decision

Action Types:
- RESPOND: Provide information or ask for clarification
- TOOL_CALL: Use a tool to gather information or perform an action
- MOVE: Transition to another step
- END: End the conversation`;

    if (constraints?.actions && constraints.actions.length > 0) {
      prompt += `\n\nAllowed actions in this response: ${constraints.actions.join(', ')}.`;
    }
    if (constraints?.fields && constraints.fields.length > 0) {
      prompt += `\nOnly include these fields in the JSON: ${constraints.fields.join(', ')}.`;
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

      const decisionData = JSON.parse(jsonMatch[0]);

      return {
        action: decisionData.action,
        target: decisionData.target,
        response: decisionData.response,
        tool_name: decisionData.tool_name,
        tool_args: decisionData.tool_args,
        reasoning: decisionData.reasoning,
      };
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
      // Generate decision
      const context = this.buildContext();
      const decision = await this.generateDecision(userInput || '', context, constraints);

      // Execute decision
      return await this.executeDecision(decision, returnTool, returnStep, verbose);
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
    const recentMessages = this.history.slice(-5); // Last 5 items
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

    // Normalize decision fields
    if (!decision.target && (decision as any).step_id) {
      (decision as any).target = (decision as any).step_id;
    }
    if (!decision.tool_name && (decision as any).tool_call?.tool_name) {
      (decision as any).tool_name = (decision as any).tool_call.tool_name;
      (decision as any).tool_args = (decision as any).tool_call.tool_kwargs;
    }

    switch (decision.action) {
      case 'TOOL_CALL':
        if (decision.tool_name && decision.tool_args) {
          try {
            const result = await this.runTool(decision.tool_name, decision.tool_args);
            toolOutput = JSON.stringify(result);

            // Add tool result to history
            this.history.push({
              role: 'tool',
              content: `Tool ${decision.tool_name} result: ${toolOutput}`,
              timestamp: new Date(),
            });
          } catch (error) {
            toolOutput = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
          }
        }
        break;

      case 'MOVE':
        if (decision.target) {
          this.currentStepId = decision.target;
          this.history.push({ step_id: decision.target });
        }
        break;

      case 'END':
        // Conversation ended
        break;
    }

    // Add user input to history if provided
    if (decision.response) {
      this.history.push({
        role: 'assistant',
        content: decision.response,
        timestamp: new Date(),
      });
    }

    return {
      response: decision.response || null,
      tool_output: returnTool ? toolOutput : null,
      state: this.getState(),
      decision: verbose ? decision : undefined,
    };
  }

  // Create response helper
  private createResponse(
    response: string,
    action: 'RESPOND' | 'END' = 'RESPOND'
  ): Response {
    if (action === 'RESPOND') {
      this.history.push({
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      });
    }

    return {
      response,
      tool_output: null,
      state: this.getState(),
    };
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
