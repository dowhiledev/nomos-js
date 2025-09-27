# NOMOS TypeScript Framework

A TypeScript port of the NOMOS agent framework for building advanced LLM-powered assistants with structured, multi-step workflows.

## Features

- **Step-based Flows**: Define agent behavior as sequences of steps with tools and transitions
- **Type Safety**: Full TypeScript support with Zod schemas for validation
- **Multiple LLM Providers**: OpenAI, Anthropic, Google, and more via AI SDK
- **Tool Integration**: Create custom tools and integrate external APIs
- **Session Management**: Built-in conversation state and persistence
- **Flow Management**: Organize complex workflows with shared context
- **Server + Client**: Minimal HTTP server with NDJSON streaming and a typed client

## Installation

```bash
npm install @dowhiledev/nomos ai zod uuid
# Plus your preferred LLM provider
npm install @ai-sdk/openai @ai-sdk/anthropic
```

## Quick Start

```typescript
import { Agent, OpenAILLM, createTool } from '@dowhiledev/nomos';
import { z } from 'zod';

// 1. Configure LLM
const llm = new OpenAILLM({
  provider: 'openai',
  model: 'gpt-4',
  apiKey: process.env.OPENAI_API_KEY!,
});

// 2. Define tools
const calculator = createTool(
  'calculate',
  'Perform calculations',
  z.object({ expression: z.string() }),
  async ({ expression }) => eval(expression),
);

// 3. Define agent steps
const steps = [
  {
    step_id: 'greet',
    description: 'Greet user and ask how to help',
    routes: [
      { target: 'calculate', condition: 'User wants math help' },
      { target: 'end', condition: 'User wants to end' },
    ],
  },
  {
    step_id: 'calculate',
    description: 'Help with calculations',
    routes: [{ target: 'greet', condition: 'User has another question' }],
    available_tools: ['calculate'],
  },
  {
    step_id: 'end',
    description: 'End conversation',
    routes: [],
  },
];

// 4. Create agent
const agent = new Agent({
  name: 'math_assistant',
  steps,
  startStepId: 'greet',
  persona: 'You are a helpful math assistant.',
  tools: [calculator],
  llm,
});

// 5. Use agent
async function chat() {
  let response = await agent.next();
  console.log(response.response); // "Hello! How can I help you with math?"

  response = await agent.next('What is 15 * 23?');
  console.log(response.response); // Agent uses calculator tool and responds
}
```

## Core Concepts

### Agents

Agents are the main entry point. They contain:

- **Steps**: Individual conversation states
- **Tools**: Functions the agent can call
- **Flows**: Optional workflow organization
- **LLM**: Language model for decision making

### Steps

Steps define what the agent does at each point:

```typescript
const step = {
  step_id: 'gather_info',
  description: 'Ask user for required information',
  routes: [
    { target: 'process', condition: 'User provided all info' },
    { target: 'clarify', condition: 'Info is incomplete' },
  ],
  available_tools: ['validate_input'],
  answer_model: z.object({
    name: z.string(),
    email: z.string(),
  }),
};
```

### Tools

Tools extend agent capabilities:

```typescript
// Function tool
const searchTool = createTool(
  'web_search',
  'Search the web',
  z.object({ query: z.string() }),
  async ({ query }) => {
    // Implementation
    return { results: [] };
  },
);

// HTTP API tool
const weatherTool = createHTTPTool(
  'get_weather',
  'Get weather data',
  z.object({ city: z.string() }),
  {
    url: 'https://api.weather.com',
    method: 'GET',
  },
);
```

### Sessions

Sessions manage conversation state:

```typescript
// Create session
const session = agent.createSession();

// Or restore from state
const session = agent.createSession(previousState);

// Interact
const response = await session.next('User input');
const state = session.getState(); // For persistence
```

## Advanced Usage

### Server + Client

Start a minimal HTTP server and stream responses:

```ts
import { createHttpServer } from '@dowhiledev/nomos/server';
import { Agent, OpenAILLM } from '@dowhiledev/nomos';

const agent = new Agent({
  /* ...config... */ llm: new OpenAILLM({ provider: 'openai', model: 'gpt-4' }),
});
createHttpServer(agent, { pathBase: '/api' });
```

Call it from Node/browser with the client:

```ts
import { AgentClient } from '@dowhiledev/nomos/client';

const client = new AgentClient({ baseUrl: 'http://localhost:8788/api' });
const res = await client.next('Hello');
for await (const ev of client.stream('Hi')) {
  if (ev.type === 'partial' && ev.response_chunk) process.stdout.write(ev.response_chunk);
}
```

### Custom LLM Providers

```typescript
import { AnthropicLLM } from '@dowhiledev/nomos';

const llm = new AnthropicLLM({
  provider: 'anthropic',
  model: 'claude-3-sonnet-20240229',
  apiKey: process.env.ANTHROPIC_API_KEY!,
});
```

### Flow Management

```typescript
const flows = [
  {
    config: {
      flow_id: 'onboarding',
      name: 'User Onboarding',
      steps: ['welcome', 'collect_info', 'setup'],
      start_step_id: 'welcome',
    },
    steps: [
      /* step definitions */
    ],
  },
];

const agent = new Agent({
  // ... other config
  flows,
});
```

### Decision Examples

Add few-shot examples to guide LLM decisions:

```typescript
const step = {
  step_id: 'classify_intent',
  description: 'Determine user intent',
  examples: [
    {
      context: 'User says: I want to book a flight',
      decision: { action: 'MOVE', target: 'booking_flow' },
    },
    {
      context: 'User says: Tell me a joke',
      decision: { action: 'RESPOND', response: 'Why did the chicken cross the road?' },
    },
  ],
  routes: [
    /* routes */
  ],
};
```

### Error Handling

```typescript
try {
  const response = await agent.next(userInput);
  if (response.tool_output) {
    // Handle tool results
  }
} catch (error) {
  // Handle errors (rate limits, API failures, etc.)
  console.error('Agent error:', error);
}
```

## Configuration from YAML/JSON

You can define agents declaratively:

```typescript
import fs from 'fs';
import { Agent } from '@dowhiledev/nomos';

const config = JSON.parse(fs.readFileSync('agent-config.json', 'utf8'));
const agent = Agent.fromConfig(config, llm, tools);
```

## Session Persistence

```typescript
// Save session state
const state = session.getState();
fs.writeFileSync('session.json', JSON.stringify(state));

// Restore session
const savedState = JSON.parse(fs.readFileSync('session.json', 'utf8'));
const session = agent.createSession(savedState);
```

## Best Practices

1. **Step Design**: Keep steps focused on single responsibilities
2. **Route Conditions**: Write clear, specific route conditions
3. **Tool Validation**: Use Zod schemas for tool parameters
4. **Error Handling**: Implement proper error recovery
5. **Testing**: Test agent flows with various inputs
6. **Performance**: Use appropriate LLM models for your use case

## Examples

See the `examples/` directory for complete implementations:

- `simple-example.ts` - Basic agent setup
- `general-assistant.ts` - Multi-topic assistant
- `customer-support.ts` - Workflow-based support agent

## API Reference

### Agent

- `constructor(options: AgentOptions)`
- `fromConfig(config: AgentConfig, llm: LLMBase, tools?: Tool[])`
- `next(userInput?, sessionData?, returnTool?, returnStep?, verbose?): Promise<Response>`
- `createSession(state?: State): Session`
- `addTool(tool: Tool): void`
- `addStep(step: Step): void`

### Session

- `next(userInput?, returnTool?, returnStep?, verbose?): Promise<Response>`
- `getState(): State`

### Tools

- `createTool(name, description, schema, fn): Tool`
- `createHTTPTool(name, description, schema, config): Tool`

## Migration from Python NOMOS

Key differences when migrating from Python:

1. **Types**: Everything is strongly typed
2. **Schemas**: Use Zod instead of Pydantic
3. **Tools**: Define parameter schemas explicitly
4. **Async**: All operations are async
5. **Imports**: Use AI SDK instead of direct API calls

## Contributing

Contributions welcome! Please see the main NOMOS repository for contribution guidelines.

## License

MIT
