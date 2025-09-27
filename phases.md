Focused Roadmap (Phases)

Phase 0 — Completed Foundations

- Zod models and parsing utilities are in place: `src/models/schemas.ts`, normalization helpers in `src/models/normalize.ts`.
- LLM abstraction completed for OpenAI + Anthropic via Vercel AI SDK: `src/llms/index.ts` supports text/object gen, streaming, embeddings (Anthropic uses OpenAI fallback for embeddings).
- Memory system with adapters: in‑memory, filesystem, and localStorage; plus full state adapters: `src/memory/index.ts`.
- State machine and flows implemented with entry/exit validation and flow tracking: `src/core/state-machine.ts`.
- Decision engine uses structured generation with Zod, embeddings‑guided examples, and validation/retry: in `src/core/session.ts`.
- Agent/session APIs aligned with Python design; optional event emitter interface: `src/core/agent.ts`, `src/core/session.ts`, `src/core/events.ts`.
- Config loading and Mermaid visualization exist: `src/config/loader.ts`, `src/utils/mermaid.ts`.
- Working examples including streaming and a minimal HTTP server demo: `examples/*`, notably `examples/browser-stream/server.ts`.

Phase 1 — Tools Hardening & Registry

- Add error taxonomy and typed results: introduce `InvalidArgumentsError`, `FallbackError`; extend `ToolResult` with `code`, `status` enum, and metadata while keeping current shape (`src/tools/index.ts`).
- Namespaced `ToolRegistry`: support namespaces, serialization of tool definitions, and restoration from JSON; ensure session uses registry consistently.
- Argument validation guidance: keep current missing‑arg retry in `Session.ensureValidDecision` and enhance to include human‑readable hints per missing key using Zod issue messages.
- Acceptance: Tools return typed errors; registry can list/serialize/restore; guided retries enumerate missing keys clearly.

Phase 2 — Nomos Agent Server + Client SDK

- Server: add `src/server` with a lightweight HTTP abstraction to serve agents.
  - `createAgentServer(agent, opts?)` returns handlers for `POST /next` and `POST /stream` (NDJSON or SSE) and an optional static step for health.
  - Provide adapters: `http` (Node core) and `express` (dependency present in package.json) for easy integration; narrow, dependency‑free core.
  - Standardize request/response contracts using current `Session.next` and `Session.streamNext` signatures: `{ userInput?, state?, returnTool?, returnStep?, verbose? }` → `{ response, state, tool_output?, decision? }` and NDJSON stream events.
- Client: add `AgentClient` in `src/client` to talk to a Nomos Agent Server.
  - `client.next(input?, state?, opts?)` and `client.stream(input?, state?, opts?)` mirroring `Agent` API; implement NDJSON parsing for `stream`.
  - Include browser‑safe fetch implementation and Node polyfill path; typed responses with current Zod schemas.
- Export both from `src/index.ts`; provide `examples/server` and `examples/client` using the new APIs by migrating `examples/browser-stream/server.ts`.
- Acceptance: One‑line boot for server, and client can call it from Node/browser using the same package. Streaming works end‑to‑end.

Phase 3 — Packaging & Environment Guards

- Conditional exports for Node/Edge/Browser where needed (e.g., `./dist/index.node.js`, `./dist/index.edge.js`) or guarded dynamic imports for Node‑only modules (fs/path) already used by adapters.
- Ensure no Node APIs leak into browser paths; move fs‑based persistence behind guards (already isolated in adapters, keep it that way).
- ESM/CJS interop sanity and smaller surface in `package.json` exports; consider subpath exports for `server` and `client`.
- Acceptance: Browser builds exclude Node adapters; server builds tree‑shake client‑only parts; examples run in all targets.

Phase 4 — Deferred/MCP Tools (Stretch but Prioritized After Server/Client)

- Deferred tools: design an interface for async/long‑running tool results with polling hooks and a `DEFERRED_TOOL_RESULT` action or resume path.
- MCP bridge: define interfaces and a Node‑only adapter stub that maps MCP tools to `Tool` instances; guard behind environment checks.
- Acceptance: At least one deferred tool example with guided handoff; MCP adapter stub loads and lists tools, even if network stubs initially.

Phase 5 — Docs, Telemetry, and Polish

- Docs: getting started for Node/Browser; server/client quickstarts; flows/mermaid; persistence; events.
- Telemetry: optional OpenTelemetry hooks in `EventEmitter` and structured logging toggles; disabled by default.
- Examples and tests: migrate existing HTTP example to the new server/client APIs; add Vitest coverage for server handlers and client streaming parser.
- Acceptance: README and docs updated; examples runnable; basic OTEL hooks wired behind flags.

Notes

- This roadmap consolidates all completed work into Phase 0 and prioritizes Server/Client abstractions next, followed by packaging and tool system parity features.
- Code cross‑check: the items marked as completed above exist in the repo and align with `phases.old.md` and current implementation.
