import { z } from 'zod';

// Action types for agent decisions
export const ActionSchema = z.enum(['MOVE', 'RESPOND', 'TOOL_CALL', 'END']);
export type Action = z.infer<typeof ActionSchema>;

// Route schema for step transitions
export const RouteSchema = z.object({
  target: z.string(),
  condition: z.string(),
});
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
export const StepSchema = z.object({
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
});
export type Step = z.infer<typeof StepSchema>;

// Decision schema for agent actions
export const DecisionSchema = z.object({
  action: ActionSchema,
  target: z.string().optional(),
  response: z.any().optional(),
  tool_name: z.string().optional(),
  tool_args: z.record(z.any()).optional(),
  reasoning: z.string().optional(),
});
export type Decision = z.infer<typeof DecisionSchema>;

// Event types for session tracking
export const EventSchema = z.object({
  type: z.string(),
  data: z.any(),
  timestamp: z.date().default(() => new Date()),
  decision: DecisionSchema.optional(),
});
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
export const FlowContextSchema = z.object({
  flow_id: z.string(),
  current_step_id: z.string().optional(),
  variables: z.record(z.any()).default({}),
});
export type FlowContext = z.infer<typeof FlowContextSchema>;

// Flow state for persistence
export const FlowStateSchema = z.object({
  flow_id: z.string(),
  flow_context: FlowContextSchema,
  flow_memory_context: z.array(z.union([MessageSchema, SummarySchema, StepIdentifierSchema])),
});
export type FlowState = z.infer<typeof FlowStateSchema>;

// Session state for persistence
export const StateSchema = z.object({
  session_id: z.string(),
  current_step_id: z.string(),
  history: z.array(z.union([MessageSchema, SummarySchema, StepIdentifierSchema])),
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
export const FlowConfigSchema = z.object({
  flow_id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  steps: z.array(z.string()), // Step IDs
  start_step_id: z.string(),
  variables: z.record(z.any()).default({}),
});
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
});
export type AgentConfig = z.infer<typeof AgentConfigSchema>;