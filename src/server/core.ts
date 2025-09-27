import type { Agent } from '../core/agent';
import type { AgentServerOptions, NextRequestBody, StreamEvent } from './types';

export function createAgentServer(agent: Agent, options: AgentServerOptions = {}) {
  const base = options.pathBase || '/api';
  const streamCT = options.streamContentType || 'application/x-ndjson';

  async function handleNext(reqBody: NextRequestBody) {
    const { userInput, state, returnTool, returnStep, verbose, constraints } = reqBody || {};
    let currentState = state;
    let turns = 0;
    let out = await agent.next(userInput, currentState, !!returnTool, !!returnStep, !!verbose, constraints);
    // Auto-chain when no assistant text was produced (TOOL_CALL/MOVE follow-ups)
    while (!out.response && turns < 3) {
      turns++;
      currentState = out.state;
      out = await agent.next(undefined, currentState, !!returnTool, !!returnStep, !!verbose, constraints);
    }
    return out;
  }

  async function handleStream(reqBody: NextRequestBody, onEvent: (e: StreamEvent) => void) {
    const { userInput, state, returnTool, returnStep, verbose, constraints } = reqBody || {};
    let lastAction: string | undefined;
    let hadAnyChunk = false;
    let lastState: any = state;
    let turns = 0;

    async function streamOneTurn(input?: string) {
      hadAnyChunk = false;
      // Enforce order: reasoning -> action -> tool_call -> response
      const printedWhy = new Set<string>();
      const pendingTools: Array<{ tool_name: string; tool_args: Record<string, any> }> = [];
      let pendingAction: string | undefined;
      let preambleFlushed = false;
      let bufferedResponse = '';
      let responseStarted = false;

      function flushPreambleIfNeeded() {
        if (preambleFlushed) return;
        // Action after any already-emitted reasoning
        if (pendingAction) onEvent({ type: 'partial', action: pendingAction });
        for (const t of pendingTools) onEvent({ type: 'partial', tool_call: { tool_name: t.tool_name, tool_args: t.tool_args || {} } });
        preambleFlushed = true;
        if (bufferedResponse) { onEvent({ type: 'partial', response_chunk: bufferedResponse }); bufferedResponse = ''; }
      }

      for await (const upd of agent.streamNext(input, lastState, !!returnTool, !!returnStep, !!verbose, constraints)) {
        if (!responseStarted && upd.decision && Array.isArray((upd.decision as any).reasoning)) {
          for (const r of (upd.decision as any).reasoning as string[]) {
            if (r && r.trim() && !printedWhy.has(r)) { printedWhy.add(r); onEvent({ type: 'partial', why: r }); }
          }
        }
        if (upd.decision && (upd.decision as any).action) {
          lastAction = (upd.decision as any).action as string;
          // Defer action until we flush the preamble
          pendingAction = lastAction;
        }
        if (!responseStarted && (upd as any).tool_call) {
          const tc = (upd as any).tool_call;
          const tool_args = (tc.tool_args ?? tc.tool_kwargs) || {};
          const key = `${tc.tool_name}:${JSON.stringify(tool_args)}`;
          if (!pendingTools.find(t => `${t.tool_name}:${JSON.stringify(t.tool_args||{})}` === key)) {
            pendingTools.push({ tool_name: tc.tool_name, tool_args });
          }
        }
        if (typeof (upd as any).response_chunk === 'string' && (upd as any).response_chunk.length > 0) {
          hadAnyChunk = true;
          // First time we see response, flush preamble and stop emitting further why/tool
          if (!responseStarted) {
            responseStarted = true;
            flushPreambleIfNeeded();
          }
          if (!preambleFlushed) {
            bufferedResponse += (upd as any).response_chunk;
          } else {
            onEvent({ type: 'partial', response_chunk: (upd as any).response_chunk });
          }
        }
        if ((upd as any).type === 'final' && (upd as any).response) {
          // Flush preamble (action + tools) before final
          flushPreambleIfNeeded();
          lastState = (upd as any).response.state;
          onEvent({ type: 'final', response: (upd as any).response.response || '', state: lastState });
        }
        // If we have buffered response and at least one reasoning line has been printed, we can flush preamble now
        if (!preambleFlushed && (printedWhy.size > 0 || pendingAction || pendingTools.length > 0) && bufferedResponse) {
          flushPreambleIfNeeded();
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
