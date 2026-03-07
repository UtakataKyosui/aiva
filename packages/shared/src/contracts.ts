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
  note: z.string().max(500).nullable(),
});

export const userPreferencesRecordSchema = userPreferencesInputSchema.extend({
  id: z.string(),
  updatedAt: z.string(),
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
export type DailySuggestionResponse = z.infer<typeof dailySuggestionResponseSchema>;
