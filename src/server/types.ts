import type { DecisionConstraints, Response, State } from '../models/schemas';

export interface NextRequestBody {
  userInput?: string;
  state?: State;
  returnTool?: boolean;
  returnStep?: boolean;
  verbose?: boolean;
  constraints?: DecisionConstraints;
  chainMoves?: boolean;
}

export type NextResponseBody = Response;

export type StreamEvent =
  | {
      type: 'partial';
      action?: string;
      why?: string;
      response_chunk?: string;
      tool_call?: { tool_name: string; tool_args: Record<string, any> };
    }
  | { type: 'final'; response: string; state: State; events?: any[] };

export interface AgentServerOptions {
  pathBase?: string; // default '/api'
  streamContentType?: 'application/x-ndjson' | 'text/event-stream';
  cors?: { origin?: string; allowHeaders?: string[]; allowMethods?: string[] };
}
