**Public API (nomos-js)**

- Core
  - `Agent`, `Session`
  - `Agent.fromConfig(config, llm, tools?)`
  - `createTool`, `createHTTPTool`

- Models & Types
  - Schemas: `AgentConfigSchema`, `StepSchema`, `DecisionSchema`, `StateSchema`, `EventSchema`, `FlowSchema`, `DecisionConstraintsSchema`
  - Types: `AgentConfig`, `Step`, `Decision`, `State`, `Event`, `Flow`, `DecisionConstraints`
  - Normalizers: `normalizeAgentConfig`, `normalizeStep`, `normalizeRoute`, `normalizeFlow`

- LLMs
  - Interfaces: `LLMBase`, `LLMConfig`
  - Providers: `OpenAILLM`, `AnthropicLLM` (via AI SDK wrappers)

- Tools
  - Interfaces: `Tool`, `ToolResult`
  - Registry and helpers re-exported from `./tools`

- Memory
  - `Memory` plus adapters: in-memory, filesystem, localStorage; `StateAdapter` variants

- Server/Client (subpath exports)
  - `nomos-js/server`: `createAgentServer`, `createHttpServer`, `startHttpServer`, `createExpressRouter`, server `types`
  - `nomos-js/client`: `AgentClient`

- Utilities
  - `agentToMermaid` for visualization
  - Config loader `createAgentFromConfig`, `toAgentConfig`, `loadFileSync`

Notes

- ESM-first with types in `dist`. Subpath exports available for server/client.
