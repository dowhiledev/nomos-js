import type { Agent } from '../core/agent';
import type { AgentServerOptions, NextRequestBody, StreamEvent } from './types';

export function createAgentServer(agent: Agent, options: AgentServerOptions = {}) {
  const base = options.pathBase || '/api';
  const streamCT = options.streamContentType || 'application/x-ndjson';

  async function handleNext(reqBody: NextRequestBody) {
    const { userInput, state, returnTool, returnStep, verbose, constraints } = reqBody || {};
    const res = await agent.next(userInput, state, !!returnTool, !!returnStep, !!verbose, constraints);
    return res;
  }

  async function handleStream(reqBody: NextRequestBody, onEvent: (e: StreamEvent) => void) {
    const { userInput, state, returnTool, returnStep, verbose, constraints } = reqBody || {};
    let lastAction: string | undefined;
    let hadAnyChunk = false;
    let lastState: any = state;
    let turns = 0;

    async function streamOneTurn(input?: string) {
      hadAnyChunk = false;
      for await (const upd of agent.streamNext(input, lastState, !!returnTool, !!returnStep, !!verbose, constraints)) {
        if (upd.decision && (upd.decision as any).action) {
          lastAction = (upd.decision as any).action as string;
          onEvent({ type: 'partial', action: lastAction });
        }
        if (upd.decision && Array.isArray((upd.decision as any).reasoning)) {
          for (const r of (upd.decision as any).reasoning as string[]) {
            if (r && r.trim()) onEvent({ type: 'partial', why: r });
          }
        }
        if ((upd as any).tool_call) {
          const tc = (upd as any).tool_call;
          onEvent({ type: 'partial', tool_call: { tool_name: tc.tool_name, tool_args: tc.tool_args || {} } });
        }
        if (typeof (upd as any).response_chunk === 'string' && (upd as any).response_chunk.length > 0) {
          hadAnyChunk = true;
          onEvent({ type: 'partial', response_chunk: (upd as any).response_chunk });
        }
        if ((upd as any).type === 'final' && (upd as any).response) {
          lastState = (upd as any).response.state;
          onEvent({ type: 'final', response: (upd as any).response.response || '', state: lastState });
        }
      }
    }

    await streamOneTurn(userInput);
    while (!hadAnyChunk && (lastAction === 'MOVE' || lastAction === 'TOOL_CALL') && turns < 3) {
      turns++;
      await streamOneTurn(undefined);
    }
  }

  return {
    base,
    streamCT,
    handleNext,
    handleStream,
  };
}

