import { z } from 'zod';

// Tool execution result
export const ToolResultSchema = z.object({
  success: z.boolean(),
  result: z.any(),
  error: z.string().optional(),
});

export type ToolResult = z.infer<typeof ToolResultSchema>;

// Base Tool interface
export interface Tool {
  name: string;
  description: string;
  parameters: z.ZodSchema;
  run(args: Record<string, any>): Promise<ToolResult>;
}

// Function tool wrapper
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
      // Validate parameters
      this.parameters.parse(args);

      // Execute function
      const result = await this.fn(args);

      return {
        success: true,
        result,
      };
    } catch (error) {
      return {
        success: false,
        result: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// HTTP API tool
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
      this.parameters.parse(args);

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
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      return {
        success: true,
        result,
      };
    } catch (error) {
      return {
        success: false,
        result: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Tool registry for managing available tools
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }
}

// Global tool registry instance
export const toolRegistry = new ToolRegistry();

// Helper function to create tools from functions
export function createTool(
  name: string,
  description: string,
  parameters: z.ZodSchema,
  fn: (...args: any[]) => any,
): Tool {
  return new FunctionTool(name, description, parameters, fn);
}

// Helper function to create HTTP tools
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
