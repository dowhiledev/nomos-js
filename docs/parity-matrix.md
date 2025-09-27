**Parity Matrix (Python NOMOS → TypeScript)**

- Core
  - Agent: Basic create/fromConfig/next/session present. Missing: logging, keep_event_decision, decision_constraints support in next.
  - Session: Basic history/state present. Missing: flow-aware memory, events, persistence adapters, retry policy parity.
  - State Machine: Not implemented in TS yet.

- Models/Schemas
  - Steps/Routes: Present; now support aliases (id/desc/paths/tools, to/when).
  - Decision: Present; now supports tool_call and step_id alias, suggestions.
  - DecisionConstraints: Added in TS.
  - Events/Messages/Summary: Present; Event now aligned to content.
  - Flow/FlowContext/FlowState: Expanded but not fully used yet.
  - AgentConfig: Present; logging/memory optional placeholders added.

- LLMs
  - Abstraction: Present with mocks; missing real AI SDK integrations and structured/object generation.
  - Embeddings: Mocked; missing batch embedding.

- Tools
  - Function/HTTP tools: Present. Missing: error taxonomy, deferred/MCP, registry namespaces.

- Memory/Flows
  - Memory system: Not yet implemented (only history array in session).
  - Flows: Models exist; runtime/state-machine not implemented.

- Utils
  - Normalization: Added for config/steps/routes.
  - Visualization: Not implemented.

- DX/Docs/Tests
  - Tests: Added initial schema tests; broader coverage missing.
  - Docs: Phase plan present; arch and API surface added.

Notes

- Targets for v1: structured decision gen, Node/Edge compatibility, minimal state machine for route validation, basic memory with summaries, OpenAI/Anthropic providers via AI SDK.
