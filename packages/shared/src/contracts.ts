import { z } from 'zod';

export const ingredientCategories = [
  '野菜',
  '果物',
  '肉',
  '魚',
  '卵・乳製品',
  '穀物',
  '豆・大豆製品',
  '調味料',
  '冷凍食品',
  'その他',
] as const;

export const quantityUnits = [
  'g',
  'kg',
  'ml',
  'l',
  '個',
  '本',
  '袋',
  'パック',
  '枚',
  '食分',
] as const;

export const mealTypes = ['朝食', '昼食', '夕食', '間食'] as const;
export const llmProviders = ['openai', 'openrouter'] as const;

export const ingredientInputSchema = z.object({
  name: z.string().min(1, '食材名は必須です'),
  category: z.enum(ingredientCategories),
  quantity: z.number().positive('数量は正の数で入力してください'),
  unit: z.enum(quantityUnits),
  expiresOn: z.string().nullable(),
  calories: z.number().nonnegative().nullable(),
  protein: z.number().nonnegative().nullable(),
  fat: z.number().nonnegative().nullable(),
  carbs: z.number().nonnegative().nullable(),
  note: z.string().max(280).nullable(),
});

export const ingredientRecordSchema = ingredientInputSchema.extend({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const mealLogInputSchema = z.object({
  consumedOn: z.string(),
  mealType: z.enum(mealTypes),
  menuName: z.string().min(1, 'メニュー名は必須です'),
  satisfaction: z.number().int().min(1).max(5).nullable(),
  note: z.string().max(500).nullable(),
});

export const mealLogRecordSchema = mealLogInputSchema.extend({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const userPreferencesInputSchema = z.object({
  allergies: z.array(z.string().min(1)).max(20),
  dislikes: z.array(z.string().min(1)).max(30),
  notes: z.array(z.string().min(1)).max(30),
});

export const userPreferencesRecordSchema = userPreferencesInputSchema.extend({
  id: z.string(),
  updatedAt: z.string(),
});

export const llmProviderSchema = z.enum(llmProviders);

export const llmSelectionSchema = z.object({
  provider: llmProviderSchema,
  modelId: z.string().min(1, 'モデルIDは必須です'),
});

export const llmCredentialSourceSchema = z.enum(['user', 'server', 'none']);

export const llmCredentialStatusSchema = z.object({
  configured: z.boolean(),
  source: llmCredentialSourceSchema,
  keyHint: z.string().nullable(),
});

export const llmCredentialStatusMapSchema = z.object({
  openai: llmCredentialStatusSchema,
  openrouter: llmCredentialStatusSchema,
});

export const userLlmSettingsInputSchema = llmSelectionSchema;

export const userLlmSettingsUpdateInputSchema = llmSelectionSchema.extend({
  apiKey: z
    .string()
    .min(1, 'APIキーは1文字以上で入力してください')
    .max(500)
    .nullable()
    .optional(),
  clearStoredApiKey: z.boolean().optional(),
});

export const userLlmSettingsRecordSchema = llmSelectionSchema.extend({
  updatedAt: z.string().nullable(),
  credentialStatus: llmCredentialStatusMapSchema,
});

export const llmModelOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  contextLength: z.number().int().nullable(),
  supportsStructuredOutput: z.boolean(),
});

export const llmCatalogResponseSchema = z.object({
  provider: llmProviderSchema,
  available: z.boolean(),
  reason: z.string().nullable(),
  models: z.array(llmModelOptionSchema),
});

export const llmCatalogPreviewInputSchema = z.object({
  provider: llmProviderSchema,
  apiKey: z
    .string()
    .min(1, 'APIキーは1文字以上で入力してください')
    .max(500)
    .nullable()
    .optional(),
});

export const prioritizedIngredientSchema = z.object({
  ingredientId: z.string(),
  name: z.string(),
  reason: z.string(),
  urgencyScore: z.number(),
});

export const suggestionMealSchema = z.object({
  title: z.string(),
  summary: z.string(),
  whyItFits: z.array(z.string()),
  cautions: z.array(z.string()),
});

export const dailySuggestionResponseSchema = z.object({
  suggestionDate: z.string(),
  generatedAt: z.string(),
  llm: llmSelectionSchema.nullable().optional(),
  priorities: z.array(prioritizedIngredientSchema),
  recentPattern: z.string(),
  meals: z.array(suggestionMealSchema).min(1),
  note: z.string(),
});

export type IngredientInput = z.infer<typeof ingredientInputSchema>;
export type IngredientRecord = z.infer<typeof ingredientRecordSchema>;
export type MealLogInput = z.infer<typeof mealLogInputSchema>;
export type MealLogRecord = z.infer<typeof mealLogRecordSchema>;
export type UserPreferencesInput = z.infer<typeof userPreferencesInputSchema>;
export type UserPreferencesRecord = z.infer<typeof userPreferencesRecordSchema>;
export type LlmProvider = z.infer<typeof llmProviderSchema>;
export type LlmSelection = z.infer<typeof llmSelectionSchema>;
export type UserLlmSettingsInput = z.infer<typeof userLlmSettingsInputSchema>;
export type UserLlmSettingsUpdateInput = z.infer<
  typeof userLlmSettingsUpdateInputSchema
>;
export type UserLlmSettingsRecord = z.infer<typeof userLlmSettingsRecordSchema>;
export type LlmCredentialStatus = z.infer<typeof llmCredentialStatusSchema>;
export type LlmCredentialStatusMap = z.infer<
  typeof llmCredentialStatusMapSchema
>;
export type LlmModelOption = z.infer<typeof llmModelOptionSchema>;
export type LlmCatalogResponse = z.infer<typeof llmCatalogResponseSchema>;
export type LlmCatalogPreviewInput = z.infer<
  typeof llmCatalogPreviewInputSchema
>;
export type DailySuggestionResponse = z.infer<
  typeof dailySuggestionResponseSchema
>;
