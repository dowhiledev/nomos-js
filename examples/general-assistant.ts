import { Agent, OpenAILLM, createTool, createHTTPTool } from '../src/index';
import { z } from 'zod';
import fs from 'fs';

// Load .env.local if present (for OPENAI_API_KEY) without extra deps
try {
  if (!process.env.OPENAI_API_KEY && fs.existsSync('.env.local')) {
    const content = fs.readFileSync('.env.local', 'utf8');
    for (const line of content.split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m) {
        const key = m[1];
        let val = m[2];
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith('\'') && val.endsWith('\''))) {
          val = val.slice(1, -1);
        }
        process.env[key] = process.env[key] ?? val;
      }
    }
  }
} catch {}

// Define LLM configuration
const llmConfig = {
  provider: 'openai' as const,
  model: 'gpt-4o-mini',
  apiKey: process.env.OPENAI_API_KEY!,
  temperature: 0.7,
  maxTokens: 1000,
};

// Create LLM instance
const llm = new OpenAILLM(llmConfig);

// Define tools
const weatherTool = createHTTPTool(
  'get_weather',
  'Get current weather for a city',
  z.object({
    city: z.string().describe('The city name'),
  }),
  {
    url: 'https://api.openweathermap.org/data/2.5/weather',
    method: 'GET',
  }
);

const calculatorTool = createTool(
  'calculate',
  'Perform mathematical calculations',
  z.object({
    expression: z.string().describe('Mathematical expression to evaluate'),
  }),
  async ({ expression }) => {
    // Simple calculator implementation
    try {
      // Note: In production, use a safe math evaluation library
      const result = eval(expression);
      return { result };
    } catch (error) {
      return { error: 'Invalid expression' };
    }
  }
);

// Define agent steps
const steps = [
  {
    step_id: 'greet',
    description: `Greet the user warmly and introduce yourself as a knowledgeable general assistant.
Present them with available topics: Science, History, Geography, Technology, Weather, Math.
Ask which topic they'd like to explore.`,
    routes: [
      { target: 'science', condition: 'User wants science topics' },
      { target: 'history', condition: 'User wants history topics' },
      { target: 'geography', condition: 'User wants geography topics' },
      { target: 'technology', condition: 'User wants technology topics' },
      { target: 'weather', condition: 'User wants weather information' },
      { target: 'math', condition: 'User wants math help' },
      { target: 'end', condition: 'User wants to end conversation' },
    ],
  },
  {
    step_id: 'science',
    description: `Answer science questions covering physics, chemistry, biology, astronomy.
Provide clear explanations with examples. After answering, ask about more science questions
or different topics.`,
    routes: [
      { target: 'greet', condition: 'User wants different topic' },
      { target: 'end', condition: 'User wants to end' },
    ],
  },
  {
    step_id: 'history',
    description: `Answer history questions about world history, civilizations, events, figures.
Provide context and significance. After answering, ask about more history or different topics.`,
    routes: [
      { target: 'greet', condition: 'User wants different topic' },
      { target: 'end', condition: 'User wants to end' },
    ],
  },
  {
    step_id: 'geography',
    description: `Answer geography questions about countries, capitals, landmarks, physical geography.
Share interesting facts. After answering, ask about more geography or different topics.`,
    routes: [
      { target: 'greet', condition: 'User wants different topic' },
      { target: 'end', condition: 'User wants to end' },
    ],
  },
  {
    step_id: 'technology',
    description: `Answer technology questions about computers, internet, innovations, programming.
Explain concepts clearly. After answering, ask about more technology or different topics.`,
    routes: [
      { target: 'greet', condition: 'User wants different topic' },
      { target: 'end', condition: 'User wants to end' },
    ],
  },
  {
    step_id: 'weather',
    description: `Help users get weather information for cities using the weather tool.
Ask for the city name, then provide the weather information.`,
    routes: [
      { target: 'greet', condition: 'User wants different topic' },
      { target: 'end', condition: 'User wants to end' },
    ],
    available_tools: ['get_weather'],
  },
  {
    step_id: 'math',
    description: `Help with mathematical calculations and explanations.
Use the calculator tool for computations.`,
    routes: [
      { target: 'greet', condition: 'User wants different topic' },
      { target: 'end', condition: 'User wants to end' },
    ],
    available_tools: ['calculate'],
  },
  {
    step_id: 'end',
    description: 'End the conversation politely.',
    routes: [],
  },
];

// Create the agent
const agent = new Agent({
  name: 'general_assistant',
  steps,
  startStepId: 'greet',
  persona: `You are a friendly and knowledgeable general assistant with expertise across many topics.
You explain concepts clearly and provide accurate information. You're enthusiastic about learning
and sharing knowledge.`,
  systemMessage: 'You are a helpful AI assistant with access to various tools and knowledge.',
  tools: [weatherTool, calculatorTool],
  llm,
});

// Example usage
async function main() {
  console.log('🤖 NOMOS General Assistant');
  console.log('========================\n');

  // Start conversation
  let response = await agent.next();
  console.log('Assistant:', response.response);

  // Simulate user interactions
  const userInputs = [
    'I want to know about science',
    'What is quantum physics?',
    'Now tell me about the weather in London',
    'What is 15 * 23?',
    'Goodbye',
  ];

  for (const userInput of userInputs) {
    console.log('\nUser:', userInput);

    response = await agent.next(userInput);
    console.log('Assistant:', response.response);

    if (response.tool_output) {
      console.log('Tool Output:', response.tool_output);
    }

    // Check if conversation ended
    if (response.state.current_step_id === 'end') {
      break;
    }
  }
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}

export { agent };
