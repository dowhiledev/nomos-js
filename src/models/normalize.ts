import { z } from 'zod';
import {
  AgentConfigSchema,
  StepSchema,
  RouteSchema,
  FlowSchema,
  type AgentConfig,
  type Step,
  type Route,
  type Flow,
} from './schemas';

// Normalize a route accepting alias fields
export function normalizeRoute(input: unknown): Route {
  return RouteSchema.parse(input);
}

// Normalize a step accepting alias fields
export function normalizeStep(input: unknown): Step {
  return StepSchema.parse(input);
}

// Normalize a flow accepting both TS and Python-like configs
export function normalizeFlow(input: unknown): Flow {
  return FlowSchema.parse(input);
}

// Normalize a full AgentConfig with flexible keys
export function normalizeAgentConfig(input: unknown): AgentConfig {
  return AgentConfigSchema.parse(input);
}

// Safe parsing helpers that return [result, error]
export function tryNormalizeAgentConfig(input: unknown): [AgentConfig | null, Error | null] {
  try {
    return [normalizeAgentConfig(input), null];
  } catch (e) {
    return [null, e as Error];
  }
}

export function tryNormalizeStep(input: unknown): [Step | null, Error | null] {
  try {
    return [normalizeStep(input), null];
  } catch (e) {
    return [null, e as Error];
  }
}

export function tryNormalizeRoute(input: unknown): [Route | null, Error | null] {
  try {
    return [normalizeRoute(input), null];
  } catch (e) {
    return [null, e as Error];
  }
}
