Focused Roadmap (Phases)

Phase 0 — Completed Foundations

- [x] Zod models and parsing utilities: `src/models/schemas.ts`; normalization helpers: `src/models/normalize.ts`.
- [x] LLM abstraction for OpenAI + Anthropic via Vercel AI SDK: `src/llms/index.ts` with text/object gen, streaming, embeddings.
- [x] Memory system with adapters: in‑memory, filesystem, localStorage; state adapters: `src/memory/index.ts`.
- [x] State machine and flows with entry/exit validation and flow tracking: `src/core/state-machine.ts`.
- [x] Decision engine with structured gen, embeddings‑guided examples, validation/retry: `src/core/session.ts`.
- [x] Agent/session APIs aligned with Python; optional event emitter: `src/core/agent.ts`, `src/core/session.ts`, `src/core/events.ts`.
- [x] Config loading and Mermaid visualization: `src/config/loader.ts`, `src/utils/mermaid.ts`.
- [x] Working examples including streaming and HTTP server demos: see `examples/*`.

Phase 1 — Tools Hardening & Registry

- [x] Error taxonomy and richer results: `InvalidArgumentsError`, `FallbackError`; extend `ToolResult` with `code`, `status`, metadata (`src/tools/index.ts`).
- [x] Namespaced `ToolRegistry` with serialize/restore APIs; list/get/has across namespaces.
- [x] Argument validation guidance: missing‑arg retry in `Session.ensureValidDecision` with clearer messages.
- [x] Acceptance: typed errors; registry list/serialize/restore; guided retries enumerate missing keys clearly.

Phase 2 — Nomos Agent Server + Client SDK

- [x] Server core in `src/server`: lightweight HTTP abstractions.
  - [x] `createAgentServer(agent, opts?)` with `POST /next` and `POST /stream` (NDJSON).
  - [x] Adapters: Node `http` and `express`.
  - [x] Standardized request/response contracts aligned with `Session.next/streamNext`.
- [x] Client: `AgentClient` in `src/client` with `next` and `stream` (NDJSON parsing).
- [x] Subpath exports for server/client in `package.json`; examples updated in README.
- [x] Acceptance: One‑line boot; client works from Node/browser; streaming end‑to‑end.

Phase 2B — Sessions API (Server/Client)

- [x] SessionsManager with pluggable `SessionStore` interface.
  - [x] In‑memory `InMemorySessionStore` implementation.
  - [ ] SQL adapters (Postgres/SQL) via example interface and hooks; provide contract so developers can plug in any store.
- [x] Server support: accept `sessionId` and `persist` flags; auto‑load state when not provided and auto‑save after responses.
- [x] Client support: pass `sessionId`/`persist` in `next`/`stream` opts.
- [ ] Docs: short guide on wiring custom stores and lifecycle hooks.

Phase 3 — Packaging & Environment Guards

- [ ] Conditional exports for Node/Edge/Browser or split builds.
- [x] Keep Node APIs out of browser paths; fs persistence behind adapters.
- [x] ESM-first with smaller export surface; subpath exports `server` and `client` added.
- [ ] Acceptance: Verified multi-target builds and tree‑shaking.

Phase 4 — Deferred/MCP Tools (Stretch)

- [ ] Deferred tools interface with polling and resume path.
- [ ] MCP bridge interfaces and Node‑only adapter stub.
- [ ] Acceptance: at least one deferred example; MCP stub lists tools.

Phase 5 — Docs, Telemetry, and Polish

- [x] Docs: README and docs updated; server/client quickstarts; architecture and API surface aligned.
- [ ] Telemetry: optional OpenTelemetry hooks and structured logging toggles.
- [x] Examples and tests: examples runnable; core tests present. Add more coverage for server handlers and client streaming parser.
- [ ] Acceptance: OTEL hooks guarded; broadened test coverage for server/client paths.

Notes

- This roadmap reflects current status and priorities after server/client and packaging work. Remaining focus: tool taxonomy/registry, multi‑target packaging, deferred/MCP, and telemetry.
