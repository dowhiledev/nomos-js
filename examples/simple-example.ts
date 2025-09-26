import {
  Agent,
  OpenAILLM,
  createTool,
} from '../src/index';
import { z } from 'zod';

/**
 * Simple NOMOS Agent Example
 *
 * This example demonstrates the basic usage pattern for creating
 * and interacting with NOMOS agents in TypeScript.
 */

// 1. Configure your LLM
const llm = new OpenAILLM({
  provider: 'openai',
  model: 'gpt-4',
  apiKey: process.env.OPENAI_API_KEY || 'your-api-key-here',
});

// 2. Define tools (optional)
const greetTool = createTool(
  'get_time',
  'Get the current time',
  z.object({}),
  async () => {
    return { time: new Date().toLocaleTimeString() };
  }
);

// 3. Define agent steps
const steps = [
  {
    step_id: 'start',
    description: 'Welcome the user and ask how you can help them.',
    routes: [
      { target: 'help', condition: 'User needs assistance' },
      { target: 'end', condition: 'User wants to end conversation' },
    ],
    available_tools: ['get_time'],
  },
  {
    step_id: 'help',
    description: 'Provide helpful information and ask if they need anything else.',
    routes: [
      { target: 'start', condition: 'User has another question' },
      { target: 'end', condition: 'User is done' },
    ],
  },
  {
    step_id: 'end',
    description: 'End the conversation politely.',
    routes: [],
  },
];

// 4. Create the agent
const agent = new Agent({
  name: 'simple_assistant',
  steps,
  startStepId: 'start',
  persona: 'You are a helpful assistant.',
  tools: [greetTool],
  llm,
});

// 5. Use the agent
async function chat() {
  // Start the conversation
  let response = await agent.next();
  console.log('Assistant:', response.response);

  // Continue the conversation
  response = await agent.next('What time is it?');
  console.log('Assistant:', response.response);

  if (response.tool_output) {
    console.log('Tool result:', response.tool_output);
  }

  // End conversation
  response = await agent.next('Goodbye');
  console.log('Assistant:', response.response);
}

// Example of programmatic usage
async function programmaticExample() {
  // Create a session
  const session = agent.createSession();

  // Get initial response
  let response = await session.next();
  console.log('Initial:', response.response);

  // Continue with user input
  response = await session.next('Hello!');
  console.log('Response:', response.response);

  // Get current state
  const state = session.getState();
  console.log('Current step:', state.current_step_id);
}

export { agent, chat, programmaticExample };