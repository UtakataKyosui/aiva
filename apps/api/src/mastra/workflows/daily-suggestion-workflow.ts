import {
  dailySuggestionResponseSchema,
  llmProviderSchema,
  userLlmSettingsInputSchema,
} from '@aiva/shared';
import { RequestContext } from '@mastra/core/request-context';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { and, desc, eq, gte } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import {
  ingredients,
  mealLogs,
  suggestionRuns,
  userLlmSettings,
  userPreferences,
} from '../../db/schema.js';
import {
  buildSuggestionPrompt,
  createFallbackSuggestion,
  generatedMealPlanSchema,
  rankIngredients,
} from '../../domain/suggestions.js';
import {
  resolveStoredLlmSettings,
  validateLlmSettings,
} from '../../lib/llm.js';
import { mealSuggestionAgent } from '../agents/meal-suggestion-agent.js';

const workflowInputSchema = z.object({
  userId: z.string(),
  suggestionDate: z.string(),
});

const collectedContextSchema = z.object({
  userId: z.string(),
  suggestionDate: z.string(),
  ingredients: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      category: z.string(),
      quantity: z.number(),
      unit: z.string(),
      expiresOn: z.string().nullable(),
    }),
  ),
  meals: z.array(
    z.object({
      id: z.string(),
      consumedOn: z.string(),
      mealType: z.string(),
      menuName: z.string(),
      satisfaction: z.number().nullable(),
    }),
  ),
  preferences: z
    .object({
      allergies: z.array(z.string()),
      dislikes: z.array(z.string()),
      note: z.string().nullable(),
    })
    .nullable(),
  llm: userLlmSettingsInputSchema,
});

const prioritizedContextSchema = collectedContextSchema.extend({
  priorities: dailySuggestionResponseSchema.shape.priorities,
  recentPattern: z.string(),
  prompt: z.string(),
});

const persistedSuggestionSchema = dailySuggestionResponseSchema.extend({
  userId: z.string(),
  prompt: z.string(),
});

const collectUserContext = createStep({
  id: 'collect-user-context',
  inputSchema: workflowInputSchema,
  outputSchema: collectedContextSchema,
  execute: async ({ inputData }) => {
    const dateFrom = new Date(`${inputData.suggestionDate}T00:00:00+09:00`);
    dateFrom.setDate(dateFrom.getDate() - 7);

    const [ingredientRows, mealRows, preferenceRow, llmRow] = await Promise.all(
      [
        db
          .select({
            id: ingredients.id,
            name: ingredients.name,
            category: ingredients.category,
            quantity: ingredients.quantity,
            unit: ingredients.unit,
            expiresOn: ingredients.expiresOn,
          })
          .from(ingredients)
          .where(eq(ingredients.userId, inputData.userId)),
        db
          .select({
            id: mealLogs.id,
            consumedOn: mealLogs.consumedOn,
            mealType: mealLogs.mealType,
            menuName: mealLogs.menuName,
            satisfaction: mealLogs.satisfaction,
          })
          .from(mealLogs)
          .where(
            and(
              eq(mealLogs.userId, inputData.userId),
              gte(mealLogs.consumedOn, dateFrom.toISOString().slice(0, 10)),
            ),
          )
          .orderBy(desc(mealLogs.consumedOn)),
        db.query.userPreferences.findFirst({
          where: eq(userPreferences.userId, inputData.userId),
        }),
        db.query.userLlmSettings.findFirst({
          where: eq(userLlmSettings.userId, inputData.userId),
        }),
      ],
    );

    const llm = await resolveStoredLlmSettings(
      llmRow
        ? {
            provider: llmProviderSchema.parse(llmRow.provider),
            modelId: llmRow.modelId,
          }
        : null,
    );

    return {
      userId: inputData.userId,
      suggestionDate: inputData.suggestionDate,
      ingredients: ingredientRows.map((ingredient) => ({
        ...ingredient,
        quantity: Number(ingredient.quantity),
      })),
      meals: mealRows.map((meal) => ({
        ...meal,
        consumedOn: meal.consumedOn,
        satisfaction: meal.satisfaction,
      })),
      preferences: preferenceRow
        ? {
            allergies: preferenceRow.allergies,
            dislikes: preferenceRow.dislikes,
            note: preferenceRow.note,
          }
        : null,
      llm,
    };
  },
});

const scoreIngredients = createStep({
  id: 'score-ingredients',
  inputSchema: collectedContextSchema,
  outputSchema: prioritizedContextSchema,
  execute: async ({ inputData }) => {
    const priorities = rankIngredients(inputData);
    const { prompt, recentPattern } = buildSuggestionPrompt(
      inputData,
      priorities,
    );

    return {
      ...inputData,
      priorities,
      recentPattern,
      prompt,
    };
  },
});

const generateSuggestion = createStep({
  id: 'generate-suggestion',
  inputSchema: prioritizedContextSchema,
  outputSchema: persistedSuggestionSchema,
  execute: async ({ inputData }) => {
    const validationError = await validateLlmSettings(inputData.llm).catch(
      (error) =>
        error instanceof Error
          ? error.message
          : 'モデル設定の検証に失敗しました。',
    );

    if (validationError) {
      return {
        ...createFallbackSuggestion(
          inputData,
          inputData.priorities,
          validationError,
        ),
        userId: inputData.userId,
        prompt: inputData.prompt,
      };
    }

    try {
      const requestContext = new RequestContext<{
        llmProvider: 'openai' | 'openrouter' | 'selfhosted';
        llmModelId: string;
      }>();
      requestContext.set('llmProvider', inputData.llm.provider);
      requestContext.set('llmModelId', inputData.llm.modelId);

      const response = await mealSuggestionAgent.generate(inputData.prompt, {
        requestContext,
        structuredOutput: {
          schema: generatedMealPlanSchema,
          jsonPromptInjection: true,
        },
      });
      const generatedObject = response.object as
        | z.infer<typeof generatedMealPlanSchema>
        | undefined;

      if (!generatedObject) {
        return {
          ...createFallbackSuggestion(
            inputData,
            inputData.priorities,
            'モデルから構造化レスポンスを取得できませんでした。',
          ),
          userId: inputData.userId,
          prompt: inputData.prompt,
        };
      }

      return persistedSuggestionSchema.parse({
        suggestionDate: inputData.suggestionDate,
        generatedAt: new Date().toISOString(),
        llm: inputData.llm,
        priorities: inputData.priorities,
        recentPattern: inputData.recentPattern,
        meals: generatedObject.meals,
        note: generatedObject.note,
        userId: inputData.userId,
        prompt: inputData.prompt,
      });
    } catch (error) {
      console.error('Failed to generate AI suggestion, using fallback.', error);
      return {
        ...createFallbackSuggestion(
          inputData,
          inputData.priorities,
          error instanceof Error
            ? error.message
            : 'LLM 呼び出しに失敗しました。',
        ),
        userId: inputData.userId,
        prompt: inputData.prompt,
      };
    }
  },
});

const persistSuggestion = createStep({
  id: 'persist-suggestion',
  inputSchema: dailySuggestionResponseSchema.extend({
    userId: z.string(),
    prompt: z.string(),
  }),
  outputSchema: dailySuggestionResponseSchema,
  execute: async ({ inputData }) => {
    await db.insert(suggestionRuns).values({
      id: crypto.randomUUID(),
      userId: inputData.userId,
      suggestionDate: inputData.suggestionDate,
      llmProvider: inputData.llm?.provider ?? null,
      llmModelId: inputData.llm?.modelId ?? null,
      inputBrief: {
        llm: inputData.llm ?? null,
        priorities: inputData.priorities,
        recentPattern: inputData.recentPattern,
        prompt: inputData.prompt,
      },
      result: inputData,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return dailySuggestionResponseSchema.parse(inputData);
  },
});

export const dailySuggestionWorkflow = createWorkflow({
  id: 'daily-suggestion-workflow',
  inputSchema: workflowInputSchema,
  outputSchema: dailySuggestionResponseSchema,
})
  .then(collectUserContext)
  .then(scoreIngredients)
  .then(generateSuggestion)
  .then(persistSuggestion);

dailySuggestionWorkflow.commit();
