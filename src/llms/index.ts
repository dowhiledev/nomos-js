import { generateText, embed } from 'ai';
import { z } from 'zod';

// Base LLM interface
export interface LLMBase {
  generateText(prompt: string, options?: Record<string, any>): Promise<string>;
  embedText(text: string): Promise<number[]>;
}

// Configuration schemas
export const LLMConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'google', 'ollama']),
  model: z.string(),
  apiKey: z.string().optional(),
  baseURL: z.string().optional(),
  temperature: z.number().default(0.7),
  maxTokens: z.number().default(1000),
  embeddingModel: z.string().optional(),
});

export type LLMConfig = z.infer<typeof LLMConfigSchema>;

// OpenAI implementation using @ai-sdk/openai (loaded dynamically)
export class OpenAILLM implements LLMBase {
  private config: LLMConfig;
  constructor(config: LLMConfig) {
    this.config = config;
  }

  private async getProvider() {
    try {
      const mod = await import('@ai-sdk/openai');
      if ('createOpenAI' in mod) {
        const createOpenAI = (mod as any).createOpenAI as (opts: any) => (modelId: string) => any;
        return createOpenAI({ apiKey: this.config.apiKey, baseURL: this.config.baseURL });
      }
      // Fallback to default provider using env vars
      return (mod as any).openai as (modelId: string) => any;
    } catch (e) {
      throw new Error('Please install @ai-sdk/openai to use OpenAILLM.');
    }
  }

  async generateText(prompt: string, options?: Record<string, any>): Promise<string> {
    const provider = await this.getProvider();
    const model = provider(this.config.model);
    const result = await generateText({
      model,
      prompt,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
      ...(options || {}),
    });
    return result.text;
  }

  async embedText(text: string): Promise<number[]> {
    const provider = await this.getProvider();
    const embeddingId = this.config.embeddingModel || 'text-embedding-3-small';
    const embeddingModel = (provider as any).embedding
      ? (provider as any).embedding(embeddingId)
      : // If provider() returns a function only for text models, use default openai().embedding
        (await import('@ai-sdk/openai')).openai.embedding(embeddingId);

    const result = await embed({ model: embeddingModel, value: text });
    return result.embedding;
  }
}

// Anthropic implementation using @ai-sdk/anthropic; embeddings via OpenAI fallback
export class AnthropicLLM implements LLMBase {
  private config: LLMConfig;
  constructor(config: LLMConfig) {
    this.config = config;
  }

  private async getProvider() {
    try {
      const mod = await import('@ai-sdk/anthropic');
      if ('createAnthropic' in mod) {
        const createAnthropic = (mod as any).createAnthropic as (opts: any) => (modelId: string) => any;
        return createAnthropic({ apiKey: this.config.apiKey, baseURL: this.config.baseURL });
      }
      return (mod as any).anthropic as (modelId: string) => any;
    } catch (e) {
      throw new Error('Please install @ai-sdk/anthropic to use AnthropicLLM.');
    }
  }

  async generateText(prompt: string, options?: Record<string, any>): Promise<string> {
    const provider = await this.getProvider();
    const model = provider(this.config.model);
    const result = await generateText({
      model,
      prompt,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
      ...(options || {}),
    });
    return result.text;
  }

  async embedText(text: string): Promise<number[]> {
    // Fallback to OpenAI embeddings
    const openaiMod = await import('@ai-sdk/openai');
    const embeddingId = this.config.embeddingModel || 'text-embedding-3-small';
    const provider = 'createOpenAI' in openaiMod
      ? (openaiMod as any).createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
      : (openaiMod as any).openai;
    const embeddingModel = provider.embedding(embeddingId);
    const result = await embed({ model: embeddingModel, value: text });
    return result.embedding;
  }
}

// Factory function to create LLM instances
export function createLLM(config: LLMConfig): LLMBase {
  switch (config.provider) {
    case 'openai':
      return new OpenAILLM(config);
    case 'anthropic':
      return new AnthropicLLM(config);
    case 'google':
      // Would implement GoogleLLM
      throw new Error('Google LLM not implemented yet');
    case 'ollama':
      // Would implement OllamaLLM
      throw new Error('Ollama LLM not implemented yet');
    default:
      throw new Error(`Unsupported LLM provider: ${config.provider}`);
  }
}
