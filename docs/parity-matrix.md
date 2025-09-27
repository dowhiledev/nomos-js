**Parity Matrix (Python NOMOS → TypeScript, package: nomos-js)**

- Core
  - Agent: Create/fromConfig/next/session implemented. Decision constraints supported, streaming supported. Logging hooks minimal; OTEL hooks planned.
  - Session: History/state implemented with summarization hooks; flow-aware transitions supported via state machine; persistence adapters available; retry/validation parity implemented for missing args.
  - State Machine: Implemented with route validation and flow entry/exit checks.

- Models/Schemas
  - Steps/Routes: Implemented with aliases; Zod-validated.
  - Decision: Implemented with RESPOND/MOVE/TOOL_CALL; supports tool_call and step_id alias; reasoning stream.
  - DecisionConstraints: Implemented and enforced in generation.
  - Events/Messages/Summary: Implemented and used across API.
  - Flow/FlowConfig/FlowState: Implemented and integrated with state machine.
  - AgentConfig: Implemented; optional logging/memory/state adapters supported.

- LLMs
  - Abstraction: Implemented with Vercel AI SDK; structured/object generation and streaming supported.
  - Embeddings: Implemented including batch embedding.

- Tools
  - Function/HTTP tools: Implemented. Error taxonomy and deferred/MCP planned; registry present and used.

- Memory/Flows
  - Memory system: Implemented with in-memory + filesystem + localStorage adapters; state adapters included.
  - Flows: Implemented; enforced by state machine with entry/exit validation.

- Utils
  - Normalization: Implemented for config/steps/routes/flow.
  - Visualization: Implemented via Mermaid helper.

- Server/Client
  - Server: Implemented HTTP core with Node http and Express adapters; NDJSON streaming.
  - Client: Implemented `AgentClient` with next/stream and NDJSON parsing.

- DX/Docs/Tests
  - Tests: Core models, state machine, memory, and events tests included; live provider test stub present.
  - Docs: Roadmap, architecture, and API surface aligned with code; README updated; examples provided.

Notes

- Planned after parity: deferred tools, MCP bridge, optional telemetry, expanded examples.
