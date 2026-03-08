import {
  type LlmProvider,
  llmProviderSchema,
  suggestionMealSchema,
} from '@aiva/shared';
import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { env } from '../../env';

export const mealSuggestionObjectSchema = z.object({
  meals: z.array(suggestionMealSchema).min(1).max(3),
  note: z.string().min(1),
});

const llmRequestContextSchema = z.object({
  llmProvider: llmProviderSchema,
  llmModelId: z.string().min(1),
  llmApiKey: z.string().nullable().optional(),
});

export const mealSuggestionAgent = new Agent({
  id: 'meal-suggestion-agent',
  name: 'Meal Suggestion Agent',
  instructions: `
あなたは日本語で食事提案を行う生活支援エージェントです。

制約:
- 与えられた在庫と優先食材を最優先する
- アレルギー・苦手食材を使わない
- 不確実な前提を増やしすぎない
- 提案は家庭で作りやすい現実的な内容にする
- JSON 変換しやすい、短く具体的な文章にする
`,
  requestContextSchema: llmRequestContextSchema,
  model: ({ requestContext }) => {
    const provider =
      (requestContext.get('llmProvider') as LlmProvider | undefined) ??
      'openai';
    const modelId =
      (requestContext.get('llmModelId') as string | undefined) ?? 'gpt-5-mini';
    const apiKey =
      (requestContext.get('llmApiKey') as string | null | undefined) ?? null;

    if (!apiKey) {
      return `${provider}/${modelId}`;
    }

    return provider === 'openrouter'
      ? {
          providerId: 'openrouter',
          modelId,
          apiKey,
          headers: {
            'HTTP-Referer': env.WEB_ORIGIN,
            'X-Title': 'Aiva',
          },
        }
      : {
          providerId: 'openai',
          modelId,
          apiKey,
        };
  },
});
