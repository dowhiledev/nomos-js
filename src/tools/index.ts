import { z } from 'zod';

// Error taxonomy
/** Error thrown when a tool receives invalid arguments according to its schema. */
export class InvalidArgumentsError extends Error {
  code = 'INVALID_ARGUMENTS';
  issues?: unknown;
  constructor(message: string, issues?: unknown) {
    super(message);
    this.name = 'InvalidArgumentsError';
    this.issues = issues;
  }
}

/** Error indicating a tool-specific fallback path was taken. */
export class FallbackError extends Error {
  code = 'FALLBACK';
  constructor(message: string) {
    super(message);
    this.name = 'FallbackError';
  }
}

/** Execution status for a tool result. */
export type ToolStatus = 'ok' | 'error' | 'fallback';

// Backward-compatible ToolResult with richer fields
/** Standard tool execution result shape. */
export const ToolResultSchema = z.object({
  success: z.boolean(),
  result: z.any(),
  error: z.string().optional(),
  status: z.custom<ToolStatus>().default('ok').optional(),
  code: z.string().optional(),
  meta: z.record(z.any()).optional(),
});

export type ToolResult = z.infer<typeof ToolResultSchema>;

// Base Tool interface
/** A tool callable by the agent at runtime. */
export interface Tool {
  name: string;
  description: string;
  parameters: z.ZodSchema;
  run(args: Record<string, any>): Promise<ToolResult>;
}

// Function tool wrapper
/** Wrap a function as a {@link Tool} with Zod validation. */
export class FunctionTool implements Tool {
  name: string;
  description: string;
  parameters: z.ZodSchema;
  private fn: (...args: any[]) => any;

  constructor(
    name: string,
    description: string,
    parameters: z.ZodSchema,
    fn: (...args: any[]) => any,
  ) {
    this.name = name;
    this.description = description;
    this.parameters = parameters;
    this.fn = fn;
  }

  async run(args: Record<string, any>): Promise<ToolResult> {
    try {
      // Validate parameters (capture zod issues for guidance)
      const parsed = this.parameters.safeParse(args);
      if (!parsed.success) {
        return {
          success: false,
          status: 'error',
          code: 'INVALID_ARGUMENTS',
          error: 'Invalid arguments',
          meta: { issues: parsed.error.issues },
          result: null,
        };
      }

      // Execute function
      const result = await this.fn(args);

      return {
        success: true,
        status: 'ok',
        result,
      };
    } catch (error) {
      const err = error as any;
      const code = typeof err?.code === 'string' ? err.code : 'ERROR';
      const status: ToolStatus = code === 'FALLBACK' ? 'fallback' : 'error';
      return {
        success: false,
        status,
        code,
        result: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// HTTP API tool
/** HTTP-based tool that issues a fetch to a configured endpoint. */
export class HTTPTool implements Tool {
  name: string;
  description: string;
  parameters: z.ZodSchema;
  private url: string;
  private method: string;
  private headers: Record<string, string>;

  constructor(
    name: string,
    description: string,
    parameters: z.ZodSchema,
    config: {
      url: string;
      method?: string;
      headers?: Record<string, string>;
    },
  ) {
    this.name = name;
    this.description = description;
    this.parameters = parameters;
    this.url = config.url;
    this.method = config.method || 'GET';
    this.headers = config.headers || {};
  }

  async run(args: Record<string, any>): Promise<ToolResult> {
    try {
      // Validate parameters
      const parsed = this.parameters.safeParse(args);
      if (!parsed.success) {
        return {
          success: false,
          status: 'error',
          code: 'INVALID_ARGUMENTS',
          error: 'Invalid arguments',
          meta: { issues: parsed.error.issues },
          result: null,
        };
      }

      // Make HTTP request
      const response = await fetch(this.url, {
        method: this.method,
        headers: {
          'Content-Type': 'application/json',
          ...this.headers,
        },
        body: this.method !== 'GET' ? JSON.stringify(args) : undefined,
      });

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as any;
        error.code = 'HTTP_' + String(response.status);
        throw error;
      }

      const result = await response.json();

      return {
        success: true,
        status: 'ok',
        result,
      };
    } catch (error) {
      const err = error as any;
      const code = typeof err?.code === 'string' ? err.code : 'ERROR';
      const status: ToolStatus = code === 'FALLBACK' ? 'fallback' : 'error';
      return {
        success: false,
        status,
        code,
        result: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Tool registry with optional namespaces and JSON serialization
/** Minimal serialization format for tool registry entries. */
export type ToolJSON = { namespace?: string; name: string; description: string };

/** Registry of tools with optional namespaces and (de)serialization helpers. */
export class ToolRegistry {
  private namespaces: Map<string, Map<string, Tool>> = new Map();

  private ns(name?: string): Map<string, Tool> {
    const key = name || 'default';
    let bucket = this.namespaces.get(key);
    if (!bucket) {
      bucket = new Map();
      this.namespaces.set(key, bucket);
    }
    return bucket;
  }

  register(tool: Tool, namespace?: string): void {
    this.ns(namespace).set(tool.name, tool);
  }

  get(name: string, namespace?: string): Tool | undefined {
    return this.ns(namespace).get(name);
  }

  has(name: string, namespace?: string): boolean {
    return this.ns(namespace).has(name);
  }

  list(namespace?: string): Tool[] {
    return Array.from(this.ns(namespace).values());
  }

  listAll(): Array<{ namespace: string; tool: Tool }> {
    const out: Array<{ namespace: string; tool: Tool }> = [];
    for (const [ns, bucket] of this.namespaces) {
      for (const tool of bucket.values()) out.push({ namespace: ns, tool });
    }
    return out;
  }

  toJSON(): ToolJSON[] {
    const items: ToolJSON[] = [];
    for (const [ns, bucket] of this.namespaces) {
      for (const t of bucket.values()) items.push({ namespace: ns, name: t.name, description: t.description });
    }
    return items;
  }

  static fromJSON(items: ToolJSON[], resolvers: Record<string, Tool | (() => Tool)>): ToolRegistry {
    const reg = new ToolRegistry();
    for (const it of items) {
      const r = resolvers[it.name];
      if (!r) continue;
      const tool = typeof r === 'function' ? (r as () => Tool)() : r;
      reg.register(tool, it.namespace);
    }
    return reg;
  }
}

// Global tool registry instance
export const toolRegistry = new ToolRegistry();

// Helper function to create tools from functions
/** Helper to create a function-based {@link Tool}. */
export function createTool(
  name: string,
  description: string,
  parameters: z.ZodSchema,
  fn: (...args: any[]) => any,
): Tool {
  return new FunctionTool(name, description, parameters, fn);
}

// Helper function to create HTTP tools
/** Helper to create an HTTP-based {@link Tool}. */
export function createHTTPTool(
  name: string,
  description: string,
  parameters: z.ZodSchema,
  config: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
  },
): Tool {
  return new HTTPTool(name, description, parameters, config);
}

// Helpers to sync tools between a registry and an Agent
import type { Agent } from '../core/agent';

/** Register all tools from a registry (or namespace) onto an {@link Agent}. Returns number added. */
export function applyRegistryToAgent(
  agent: Agent,
  registry: ToolRegistry,
  namespace?: string,
): number {
  const tools = namespace ? registry.list(namespace) : registry.list();
  for (const t of tools) agent.addTool(t);
  return tools.length;
}

/** Register all tools currently on an {@link Agent} into a registry namespace. Returns number registered. */
export function registerAgentTools(
  agent: Agent,
  registry: ToolRegistry,
  namespace?: string,
): number {
  const tools = agent.getTools();
  for (const t of tools) registry.register(t, namespace);
  return tools.length;
}
