import { suggestionMealSchema } from '@aiva/shared';
import { Agent } from '@mastra/core/agent';
import { z } from 'zod';

export const mealSuggestionObjectSchema = z.object({
  meals: z.array(suggestionMealSchema).min(1).max(3),
  note: z.string().min(1),
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
  model: 'openai/gpt-5-mini',
});
