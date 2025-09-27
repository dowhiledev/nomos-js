import type { DecisionConstraints, Response, State } from '../models/schemas';

/** Body for POST /next and /stream requests. */
export interface NextRequestBody {
  userInput?: string;
  state?: State;
  /** When provided, the server will load and/or persist session state under this id. */
  sessionId?: string;
  /** Persist state to the configured session store for this request. */
  persist?: boolean;
  returnTool?: boolean;
  returnStep?: boolean;
  verbose?: boolean;
  constraints?: DecisionConstraints;
  chainMoves?: boolean;
}

/** Response body for /next requests. Matches core {@link Response}. */
export type NextResponseBody = Response;

/** NDJSON stream events emitted by /stream. */
export type StreamEvent =
  | {
      type: 'partial';
      action?: string;
      why?: string;
      response_chunk?: string;
      tool_call?: { tool_name: string; tool_args: Record<string, any> };
    }
  | { type: 'final'; response: string; state: State; events?: any[] };

/** Options for creating an Agent HTTP server. */
export interface AgentServerOptions {
  pathBase?: string; // default '/api'
  streamContentType?: 'application/x-ndjson' | 'text/event-stream';
  cors?: { origin?: string; allowHeaders?: string[]; allowMethods?: string[] };
  sessions?: {
    store: import('./sessions').SessionStore;
    generateId?: () => string;
    autoPersist?: boolean;
  };
}
