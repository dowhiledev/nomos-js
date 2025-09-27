import { Agent, OpenAILLM, createTool } from '../src/index';
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
    description: `Previously supported weather via an external API. This demo omits it.
If the user asks for weather, politely explain that the weather tool is not configured in this demo.
Offer to help with other topics or math.`,
    routes: [
      { target: 'greet', condition: 'User wants different topic' },
      { target: 'end', condition: 'User wants to end' },
    ],
    available_tools: [],
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
  tools: [calculatorTool],
  llm,
});

// Example usage
async function main() {
  console.log('🤖 NOMOS General Assistant');
  console.log('========================\n');

  // Start conversation
  let response = await agent.next();
  console.log('Assistant:', response.response);

  // Simulate user interactions, preserving session state across turns
  const userInputs = [
    'I want to know about science',
    'What is quantum physics?',
    'Now tell me about the weather in London',
    'What is 15 * 23?',
    'Goodbye',
  ];

  for (const userInput of userInputs) {
    console.log('\nUser:', userInput);

    response = await agent.next(userInput, response.state, true, false, true);
    console.log('Decision:', response.decision);
    console.log('Assistant:', response.response);
    if (response.tool_output) console.log('Tool Output:', response.tool_output);

    // Auto-advance on MOVE or TOOL_CALL
    let safety = 0;
    while (response.decision && (response.decision.action === 'MOVE' || response.decision.action === 'TOOL_CALL') && safety < 3) {
      response = await agent.next(undefined, response.state, true, false, true);
      console.log('Decision:', response.decision);
      console.log('Assistant:', response.response);
      if (response.tool_output) console.log('Tool Output:', response.tool_output);
      safety++;
    }

    // Check if conversation ended
    if (response.state.current_step_id === 'end') {
      break;
    }
  }
}

// Run the example
main().catch(console.error);

export { agent };
