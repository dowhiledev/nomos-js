import { z } from 'zod';

// Action types for agent decisions
export const ActionSchema = z.enum(['MOVE', 'RESPOND', 'TOOL_CALL', 'END']);
export type Action = z.infer<typeof ActionSchema>;

// Route schema for step transitions
// Accept "to" and "when" as aliases via preprocessing
export const RouteSchema = z.preprocess((input) => {
  const obj = input as any;
  if (obj && typeof obj === 'object') {
    return {
      target: obj.target ?? obj.to,
      condition: obj.condition ?? obj.when,
    };
  }
  return input;
}, z.object({
  target: z.string(),
  condition: z.string(),
}));
export type Route = z.infer<typeof RouteSchema>;

// Step identifier for tracking current step
export const StepIdentifierSchema = z.object({
  step_id: z.string(),
});
export type StepIdentifier = z.infer<typeof StepIdentifierSchema>;

// Decision example for few-shot learning
export const DecisionExampleSchema = z.object({
  context: z.string(),
  decision: z.union([z.string(), z.lazy(() => DecisionSchema)]),
  visibility: z.enum(['always', 'never', 'dynamic']).default('dynamic'),
});
export type DecisionExample = z.infer<typeof DecisionExampleSchema>;

// Step overrides for customization
export const StepOverridesSchema = z.object({
  persona: z.string().optional(),
  llm: z.string().default('global'),
});
export type StepOverrides = z.infer<typeof StepOverridesSchema>;

// Main Step schema
export const StepSchema = z.preprocess((input) => {
  const obj = input as any;
  if (obj && typeof obj === 'object') {
    return {
      step_id: obj.step_id ?? obj.id,
      description: obj.description ?? obj.desc,
      routes: obj.routes ?? obj.paths,
      available_tools: obj.available_tools ?? obj.tools,
      answer_model: obj.answer_model,
      auto_flow: obj.auto_flow ?? false,
      quick_suggestions: obj.quick_suggestions ?? false,
      flow_id: obj.flow_id,
      overrides: obj.overrides,
      examples: obj.examples ?? obj.eg,
    };
  }
  return input;
}, z.object({
  step_id: z.string(),
  description: z.string(),
  routes: z.array(RouteSchema).default([]),
  available_tools: z.array(z.string()).default([]),
  answer_model: z.any().optional(), // Zod schema or string reference
  auto_flow: z.boolean().default(false),
  quick_suggestions: z.boolean().default(false),
  flow_id: z.string().optional(),
  overrides: StepOverridesSchema.optional(),
  examples: z.array(DecisionExampleSchema).optional(),
}));
export type Step = z.infer<typeof StepSchema>;

// Decision schema for agent actions
// ToolCall structure (parity with Python: tool_name + tool_kwargs)
export const ToolCallSchema = z.object({
  tool_name: z.string(),
  tool_kwargs: z.record(z.any()).default({}),
});

export type ToolCall = z.infer<typeof ToolCallSchema>;

// Decision (Python order: reasoning, action, response, suggestions, step_id, tool_call)
export const DecisionSchema = z
  .object({
    // Reasoning first
    reasoning: z.union([z.string(), z.array(z.string()), z.null()]).optional(),
    // The action
    action: ActionSchema,
    // RESPOND
    response: z.any().nullable().optional(),
    suggestions: z.array(z.string()).nullable().optional(),
    // MOVE
    step_id: z.string().nullable().optional(),
    // TOOL_CALL
    tool_call: ToolCallSchema.nullable().optional(),
  })
  .transform((d) => {
    // Coerce reasoning to array if string
    if (typeof (d as any).reasoning === 'string') {
      (d as any).reasoning = [(d as any).reasoning];
    }
    return d;
  });
export type Decision = z.infer<typeof DecisionSchema>;

// Event types for session tracking
// Event: accept either {type, content} or {type, data}
export const EventSchema = z.preprocess((input) => {
  const obj = input as any;
  if (obj && typeof obj === 'object') {
    return {
      type: obj.type,
      content: obj.content ?? obj.data,
      timestamp: obj.timestamp,
      decision: obj.decision,
    };
  }
  return input;
}, z.object({
  type: z.string(),
  content: z.any(),
  timestamp: z.date().default(() => new Date()),
  decision: DecisionSchema.optional(),
}));
export type Event = z.infer<typeof EventSchema>;

// Message types for conversation
export const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string(),
  timestamp: z.date().default(() => new Date()),
});
export type Message = z.infer<typeof MessageSchema>;

// Summary for memory compression
export const SummarySchema = z.object({
  summary: z.array(z.string()),
  timestamp: z.date().default(() => new Date()),
});
export type Summary = z.infer<typeof SummarySchema>;

// Flow context for managing flow state
// Align closer to Python's FlowContext
export const FlowContextSchema = z.object({
  flow_id: z.string(),
  entry_step: z.string().optional(),
  current_step_id: z.string().optional(),
  previous_context: z.array(z.union([EventSchema, SummarySchema])).optional(),
  variables: z.record(z.any()).default({}),
  metadata: z.record(z.any()).default({}),
});
export type FlowContext = z.infer<typeof FlowContextSchema>;

// Flow state for persistence
export const FlowStateSchema = z.object({
  flow_id: z.string(),
  flow_context: FlowContextSchema,
  flow_memory_context: z.array(z.union([MessageSchema, SummarySchema, StepIdentifierSchema, EventSchema])),
});
export type FlowState = z.infer<typeof FlowStateSchema>;

// Session state for persistence
export const StateSchema = z.object({
  session_id: z.string(),
  current_step_id: z.string(),
  history: z.array(z.union([MessageSchema, SummarySchema, StepIdentifierSchema, EventSchema])),
  flow_state: FlowStateSchema.optional(),
});
export type State = z.infer<typeof StateSchema>;

// Response from agent actions
export const ResponseSchema = z.object({
  response: z.any(),
  tool_output: z.string().nullable().optional(),
  state: StateSchema,
  decision: DecisionSchema.optional(),
});
export type Response = z.infer<typeof ResponseSchema>;

// Flow configuration
// Closer to Python's FlowConfig; keep TS variant optional fields
export const FlowConfigSchema = z.preprocess((input) => {
  const obj = input as any;
  if (obj && typeof obj === 'object') {
    return {
      flow_id: obj.flow_id ?? obj.id,
      name: obj.name,
      description: obj.description ?? obj.desc,
      steps: obj.steps, // TS variant
      enters: obj.enters,
      exits: obj.exits,
      start_step_id: obj.start_step_id,
      variables: obj.variables,
      components: obj.components,
    };
  }
  return input;
}, z.object({
  flow_id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  // TS simple flow config (optional)
  steps: z.array(z.string()).optional(),
  start_step_id: z.string().optional(),
  // Python flow config (optional)
  enters: z.array(z.string()).optional(),
  exits: z.array(z.string()).optional(),
  variables: z.record(z.any()).default({}),
  components: z.record(z.record(z.any())).optional(),
}));
export type FlowConfig = z.infer<typeof FlowConfigSchema>;

// Flow definition
export const FlowSchema = z.object({
  config: FlowConfigSchema,
  steps: z.array(StepSchema),
});
export type Flow = z.infer<typeof FlowSchema>;

// Agent configuration
export const AgentConfigSchema = z.object({
  name: z.string(),
  steps: z.array(StepSchema),
  start_step_id: z.string(),
  system_message: z.string().optional(),
  persona: z.string().optional(),
  show_steps_desc: z.boolean().default(false),
  max_errors: z.number().default(3),
  max_iter: z.number().default(5),
  flows: z.array(FlowSchema).optional(),
  tools: z.any().optional(), // Tool configuration
  llm: z.any().optional(), // LLM configuration
  embedding_model: z.any().optional(), // Embedding model config
  // Optional future: logging, memory configuration passthroughs
  logging: z.any().optional(),
  memory: z.any().optional(),
}).strict();
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// Decision constraints for structured retries
export const DecisionConstraintsSchema = z.object({
  actions: z.array(ActionSchema).optional(),
  fields: z.array(z.enum([
    'response',
    'target',
    'step_id',
    'tool_name',
    'tool_args',
    'tool_call',
    'suggestions',
    'reasoning',
  ])).optional(),
  tool_name: z.string().optional(),
});
export type DecisionConstraints = z.infer<typeof DecisionConstraintsSchema>;
