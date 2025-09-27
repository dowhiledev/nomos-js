**Public Exports (current and planned)**

- Core
  - `Agent`, `Session`
  - `Agent.fromConfig(config, llm, tools?)`

- Models & Utils
  - Schemas: `AgentConfigSchema`, `StepSchema`, `DecisionSchema`, `StateSchema`, `EventSchema`, `FlowSchema`, `DecisionConstraintsSchema`
  - Types: `AgentConfig`, `Step`, `Decision`, `State`, `Event`, `Flow`, `DecisionConstraints`
  - Normalizers: `normalizeAgentConfig`, `normalizeStep`, `normalizeRoute`, `normalizeFlow`

- Tools
  - Interfaces: `Tool`, `ToolResult`
  - Helpers: `createTool`, `createHTTPTool`, `toolRegistry`

- LLMs
  - Interfaces: `LLMBase`, `LLMConfig`
  - Factory: `createLLM`
  - Providers: `OpenAILLM` (mock), `AnthropicLLM` (mock). Planned: real AI SDK bindings for OpenAI/Anthropic/Google/Ollama

Planned Additions
- `state-machine`: route validation, flow transitions.
- `memory`: session/flow memory with summarization.
- `events`: event emitter interface and OpenTelemetry context propagation.

