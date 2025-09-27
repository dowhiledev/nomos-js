**Overview**

- Goal: Port Python NOMOS to TypeScript with first‑class client and server support, using the Vercel AI SDK (`ai` + provider packages) and Zod instead of Pydantic.
- Approach: Deliver in incremental, verifiable phases with parity targets, examples, and tests. Keep Node/Edge/browser compatibility in mind.

**Phase 0 — Baseline & Architecture**

- Audit Python modules: core, sessions, state machine, memory, tools (incl. MCP), llms, config, events, flows, utils.
  - ~~Capture parity matrix vs current TS (what exists, what’s missing) and target scope for v1.~~
  - ~~Decide runtime targets: Node.js (server), Edge (Vercel), Browser (client). Document fs/network constraints per target.~~
  - ~~Decide package shape (single package with optional provider peer deps) and public API surface.~~
  - ~~Deliverables: Parity matrix doc, architecture notes, API surface draft.~~

**Phase 1 — Models & Schemas (Zod)**

- Complete Zod schemas to match Python Pydantic models:
  - AgentConfig (incl. memory, logging, tools, llm, embedding, flows), Step, Route (aliases: `when`/`to`), StepOverrides, Decision, DecisionExample (with visibility), Event, Message, Summary, Flow, FlowContext/FlowState, State.
  - Add DecisionConstraints and validation helpers.
  - ~~Provide type‑safe constructors and parsing helpers (from JSON/YAML) and schema inference types.~~
  - ~~Deliverables: Extended `src/models/schemas.ts`, parsing utilities, unit tests for schema validation.~~
  - ~~Integrate examples selection (few‑shot) using embeddings input into prompts.~~
  - ~~Decision parity with Python (field names + ordering: reasoning, action, response, suggestions, step_id, tool_call).~~

**Phase 2 — LLM Abstraction (Vercel AI SDK)**

- Implement real provider wrappers backed by AI SDK:
  - ~~OpenAI (`@ai-sdk/openai`), Anthropic (`@ai-sdk/anthropic`).~~
  - ~~Support `generateText`, streaming, and structured/object generation for decisions.~~
  - ~~Implement `embedText` using provider embeddings or fallback model; batch embedding API (sequential wrapper).~~
- Config: `LLMConfig` maps to provider clients; support baseURL, apiKey, temperature, maxTokens, etc.
  - ~~Deliverables: Concrete LLM classes, provider selection factory, examples (streaming), tests remain offline.~~
  - Status: Completed for OpenAI + Anthropic (embeddings fallback via OpenAI). Streaming APIs exist but are de‑emphasized until non‑stream parity is fully solid.

**Phase 3 — Memory System**

- Implement session memory with pluggable backends (in‑memory default):
  - Append‑only history of `Message | Summary | Event | StepIdentifier`.
  - Flow memory component mirroring Python’s `FlowMemoryComponent` (scoped to current flow).
  - Simple summarization hook (pluggable, optional) and size limits.
- Persistence strategies: JSON‑serializable state for Node (fs optional), Browser (localStorage), Edge (KV adapter stub). Avoid Node‑only APIs in core paths.
- Deliverables: `src/memory/*`, interfaces, default impl, tests.
  - Status: Completed — `Memory` with in‑memory adapter, summarization, and Session integration. Persistence adapters: `FsAdapter`, `LocalStorageAdapter`. Full state persistence via `FsStateAdapter` and `LocalStorageStateAdapter`. Flow‑scoped memory implemented; FlowContext (entry_step, current_step_id, variables, metadata, previous_context) included in state.

**Phase 4 — State Machine & Flows**

- Port state machine that compiles steps, validates routes/tools, and manages flow context:
  - Flow config (start_step_id, steps), current flow tracking, enter/exit transitions.
  - Step‑level overrides (persona, llm), quick suggestions, auto_flow.
  - ~~Validation on init: start step, route targets, tools availability.~~
- Mermaid graph generation utility (string output) for visualization; optional CLI to render.
- Deliverables: `src/core/state-machine.ts`, flow utils, validation tests, visualization util.
  - Status: Completed — `StateMachine` manages steps + routes and validates flow enters/exits based on FlowConfig (enters/exits). Integrated with Session for transitions. Basic flow runtime with flow_id tracking, enter/exit detection, flow memory/events, and FlowContext exposure.

**Phase 5 — Tools System Parity**

- Extend current tools to parity:
  - Tool errors (`InvalidArgumentsError`, `FallbackError`), standardized `ToolResult` with metadata.
  - Deferred tools and step‑scoped tool resolution.
  - API tools (HTTP), function tools, package/registry mapping. MCP server bridge (interface + adapter, Node‑only guard).
  - ToolRegistry: namespacing, lookup, serialization of tool definitions.
- Deliverables: Expanded `src/tools/*`, MCP adapter stub, examples, tests.
  - Status: Function + HTTP tools present; error taxonomy/deferred/MCP pending. Tool args validation + guided retry planned.

**Phase 6 — Decision Engine**

- Replace ad‑hoc prompt/regex JSON parsing with structured generation:
  - ~~Build decision prompt messages (system/persona/context/routes/tools/examples).~~
  - ~~Use AI SDK object generation with Zod `DecisionSchema` and `DecisionConstraints` to restrict actions on retries.~~
  - ~~Add few‑shot example selection via embeddings.~~
  - ~~Route/tool validation with constraints-driven retry to RESPOND on invalid MOVE/TOOL_CALL.~~
  - Streaming decisions: API scaffolding present but de‑emphasized; focus is on robust non‑stream path.
  - Fallback strategy: on iteration limits/errors, if not `auto_flow`, emit fallback RESPOND. (Partially aligned)
- Deliverables: Decision builder, structured generation, retry policy, tests with fixtures.
  - Status: Core non‑stream engine complete; live E2E tests in place.

**Phase 7 — Session Parity & Events**

- Align `Agent`/`Session` API with Python:
  - `Agent.fromConfig(config, llm, tools)`; `next(userInput?, sessionData?, returnTool?, returnStep?, verbose?, decisionConstraints?)`.
  - Event emitter interface (async), optional OpenTelemetry context (guarded).
  - Keep/strip decision data in returned events akin to `keep_event_decision`.
- Deliverables: Updated `src/core/agent.ts` and `src/core/session.ts`, event interfaces, tests.
  - Status: APIs aligned; event system not yet added.

**Phase 8 — Client & Server Usage**

- Ensure SDK works in:
  - Node (server): file persistence optional, MCP enabled when available.
  - Edge/Browser: no Node APIs; use fetch‑only tools and JSON state persistence.
- Provide separate entrypoints if needed (e.g., `index.node`, `index.edge`) or conditional exports with guards.
- Deliverables: Environment guards, dual examples (server/client), docs.

**Phase 9 — Config Loading (YAML/JSON)**

- Add loader utilities to create agents from config files/objects:
  - Resolve tools by name via registry, providers from env/config.
  - Validate with Zod, produce helpful errors.
- Deliverables: `src/config/loader.ts`, examples, tests.

**Phase 10 — Testing & Examples**

- Port representative Python tests to Vitest:
  - Schemas, tools, state machine, decision engine, flows, session persistence.
- Expand examples: general assistant, customer support, retrieval example, flow demo, browser usage.
- Deliverables: `tests/*`, verified examples in `examples/*` with run scripts.
  - Status: Added live OpenAI E2E tests (no mocks) and interactive CLI example.

**Milestone: Non‑stream Parity Achieved**

- Decisions: Python‑parity schema and ordering; constraints; examples‑guided; validation + retry.
- Tools: Deterministic tool calls with auto‑summarized responses; tool output surfaced.
- Transitions: MOVE validated against routes; auto‑advance behavior demonstrated in interactive example.
- Demos/Tests: two‑step tool demo; general assistant; interactive CLI; live OpenAI tests.

**Next Up (Prioritized)**

1. Tool args validation against Zod schema with guided retry (list missing keys).
2. State‑machine module and basic flow runtime (enter/exit, flow memory hooks).
3. Event emitter + optional telemetry hooks.
4. Persistence adapters for memory (Node/Edge/Browser) and simple summarization.
5. MCP/Deferred tools + error taxonomy.

**Phase 11 — Docs & Migration Guide**

- Update README and add docs:
  - Mapping Pydantic → Zod, Python → TS concepts.
  - Provider setup (AI SDK), environment variables, streaming, embeddings.
  - Flow/graph visualization usage.
- Deliverables: README updates, MIGRATION.md, API reference notes.

**Phase 12 — Hardening & DX**

- Robust error handling, retries, rate‑limit/backoff, logging toggles.
- Type‑safe streaming responses and partial updates.
- ESM/CJS compatibility check, tree‑shaking, package size.
- Deliverables: Polished APIs, logging controls, CI workflow, release plan.

**Acceptance Criteria (Per Phase Summary)**

- Tests pass for added modules; examples run without mocks (where applicable).
- Parity checkpoints: memory, flows, decision constraints, tool resolution behave like Python equivalents.
- Works with `ai` package providers; builds for Node and Edge; browser demo works without Node‑only APIs.

**Immediate Gaps Identified**

- LLM wrappers are mock; replace with real AI SDK providers and structured output.
- No memory/state machine/flow parity; implement components and validations.
- Session lacks events, decision constraints, fallback policy, and persistence adapters.
- Tools lack deferred/MCP/registry parity and error taxonomy.
- JSON parsing for decisions is brittle; move to Zod‑driven structured generation.
