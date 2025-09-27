Pending Plan (Focused Roadmap)

Phase 1 — Tools & Integrations
- Error taxonomy for tools (InvalidArgumentsError, FallbackError) with standardized ToolResult metadata (status, code, message).
- Deferred/MCP tools support:
  - MCP server adapter and deferred tool resolution per step. NOTE: Skip for the time being.
  - Namespaced ToolRegistry (lookup, list, serialize tool definitions).
- Acceptance: Deferred tools callable at runtime; registry can serialize/restore tool signatures; errors are typed and surfaced.

Phase 2 — Packaging & Environments
- Environment guards to avoid Node APIs in shared/core browser/edge paths.
- Conditional/dual exports for node/edge/browser entry points to improve bundling and tree‑shaking.
- ESM/CJS interop checks and small packaging polish (files, exports map).
- Acceptance: Browser build excludes Node adapters; edge/server use correct entries; examples run in all targets.

Phase 3 — Config Loading & Visualization
- Config loader utilities (YAML/JSON):
  - Map Python fields (id/desc/paths/tools) → TS (step_id/description/routes/available_tools).
  - Validate with Zod; helpful error messages and defaults.
- Mermaid graph utility to render agent steps/flows/tools as a string; optional CLI to write SVG.
- Acceptance: Loader can build agents from barista‑style YAML; mermaid string produced; CLI writes an SVG.

Phase 4 — Docs & Telemetry
- Documentation:
  - README: getting started (Node/Browser), examples, memory/persistence/flows/events, environment setup.
  - MIGRATION.md: Python → TypeScript mapping (Pydantic→Zod, FlowContext, tools, events).
- Optional OpenTelemetry hooks and structured logging controls (log levels, JSON logs).
- Acceptance: Docs published and accurate; basic OTEL hooks available (disabled by default).

Notes
- Completed items (models, LLMs, memory/state persistence, state machine + flows, decision engine, session events, demos/tests) are archived in phases.old.md and the codebase.
- This roadmap focuses only on the remaining high‑value work to reach parity and robust DX.

