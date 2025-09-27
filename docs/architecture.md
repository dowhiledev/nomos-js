**Targets**

- Node.js (server): full feature set, optional MCP, optional fs persistence.
- Edge/Browser (client): fetch-only, no Node APIs, JSON state persistence; tools must be network or pure functions.

**Packages & Exports**

- Single package `@dowhiledev/nomos` (ESM) with optional peer deps for providers.
- Public API: `Agent`, `Session`, models/schemas, tools helpers, LLM factory/wrappers.

**Runtime Boundaries**

- Avoid Node-only imports in core paths (no `fs`/`path` in shared code).
- MCP and other Node integrations live behind guards or separate entry points.
- Use `ai` SDK for generation/embeddings; provider clients supplied by consumer env.

**Module Structure**

- `src/core`: agent, session, state-machine (planned), events.
- `src/models`: zod schemas, normalization helpers, parsing utils.
- `src/llms`: provider wrappers/factory, embeddings.
- `src/tools`: function/http tools, registry, MCP adapter (planned).
- `src/memory`: session/flow memory (planned), summarization hooks.

**API Surface (Draft)**

- Construction: `new Agent(opts)`, `Agent.fromConfig(config, llm, tools?)`.
- Session: `agent.createSession(state?)`, `session.next(...)`, `session.getState()`.
- Tools: `createTool`, `createHTTPTool`, `toolRegistry`.
- Models: Zod schemas for config/state/decision.
- LLMs: `createLLM(config)` and concrete wrappers.
