import type { DecisionConstraints, Response, State } from '../models/schemas';
import type { StreamEvent } from '../server/types';

/** Options to construct an {@link AgentClient}. */
export interface AgentClientOptions {
  baseUrl: string; // e.g. http://localhost:8788/api
  headers?: Record<string, string>;
}

/**
 * Minimal HTTP client for a Nomos Agent Server.
 *
 * Supports non-streaming `next` and NDJSON `stream` endpoints.
 *
 * @example
 * const client = new AgentClient({ baseUrl: 'http://localhost:8788/api' });
 * const res = await client.next('Hello');
 */
export class AgentClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  constructor(opts: AgentClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  }

  /**
   * Call the server's /next endpoint and return a final response.
   * @param input Optional user input string.
   * @param state Optional previously saved state to send.
   * @param opts Additional flags such as `verbose`, `chainMoves`, `sessionId`, and `persist`.
   * @returns The final response body from the server.
   */
  async next(
    input?: string,
    state?: State,
    opts?: {
      returnTool?: boolean;
      returnStep?: boolean;
      verbose?: boolean;
      constraints?: DecisionConstraints;
      chainMoves?: boolean;
      sessionId?: string;
      persist?: boolean;
    },
  ): Promise<Response> {
    const res = await fetch(this.baseUrl + '/next', {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ userInput: input, state, ...(opts || {}) }),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    return (await res.json()) as Response;
  }

  /**
   * Stream events from the server's /stream endpoint.
   * Yields partial updates (why, action, tool_call, response_chunk) and a final event.
   * @param input Optional user input string.
   * @param state Optional previously saved state to send.
   * @param opts Additional flags such as `verbose`, `chainMoves`, `sessionId`, and `persist`.
   * @returns An async iterator of stream events.
   */
  async *stream(
    input?: string,
    state?: State,
    opts?: {
      returnTool?: boolean;
      returnStep?: boolean;
      verbose?: boolean;
      constraints?: DecisionConstraints;
      chainMoves?: boolean;
      sessionId?: string;
      persist?: boolean;
    },
  ): AsyncIterable<StreamEvent> {
    const res = await fetch(this.baseUrl + '/stream', {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ userInput: input, state, ...(opts || {}) }),
    });
    if (!res.ok || !res.body) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    // NDJSON reader
    const reader = (res.body as any).getReader
      ? (res.body as ReadableStream<Uint8Array>).getReader()
      : null;
    if (reader) {
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line) continue;
          try {
            const obj = JSON.parse(line) as StreamEvent;
            yield obj;
          } catch {}
        }
      }
      if (buf.trim()) {
        try {
          yield JSON.parse(buf.trim()) as StreamEvent;
        } catch {}
      }
      return;
    }
    // Fallback: text()
    const text = await res.text();
    for (const line of text.split('\n')) {
      const s = line.trim();
      if (!s) continue;
      try {
        yield JSON.parse(s) as StreamEvent;
      } catch {}
    }
  }
}
