import {
  dailySuggestionResponseSchema,
  llmProviderSchema,
  userLlmSettingsInputSchema,
} from '@aiva/shared';
import { RequestContext } from '@mastra/core/request-context';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { and, desc, eq, gte } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client';
import {
  ingredients,
  mealLogs,
  suggestionRuns,
  userLlmSettings,
  userPreferences,
} from '../../db/schema';
import {
  buildSuggestionPrompt,
  generatedMealPlanSchema,
  rankIngredients,
} from '../../domain/suggestions';
import {
  resolveProviderApiKey,
  resolveStoredLlmSettings,
  validateLlmSettings,
} from '../../lib/llm';
import { mealSuggestionAgent } from '../agents/meal-suggestion-agent';

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
      notes: z.array(z.string()),
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
      {
        providerKeys: llmRow?.providerKeys,
      },
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
            notes: preferenceRow.notes,
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
    const llmRow = await db.query.userLlmSettings.findFirst({
      where: eq(userLlmSettings.userId, inputData.userId),
    });
    const apiKey = resolveProviderApiKey(
      inputData.llm.provider,
      llmRow?.providerKeys,
    );
    const validationError = await validateLlmSettings(inputData.llm, {
      apiKey,
    }).catch((error) =>
      error instanceof Error
        ? error.message
        : 'モデル設定の検証に失敗しました。',
    );

    if (validationError) {
      throw new Error(validationError);
    }

    try {
      const requestContext = new RequestContext<{
        llmProvider: 'openai' | 'openrouter';
        llmModelId: string;
        llmApiKey: string | null;
      }>();
      requestContext.set('llmProvider', inputData.llm.provider);
      requestContext.set('llmModelId', inputData.llm.modelId);
      requestContext.set('llmApiKey', apiKey);

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
        throw new Error('モデルから構造化レスポンスを取得できませんでした。');
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
      console.error('Failed to generate AI suggestion.', error);
      throw error instanceof Error
        ? error
        : new Error('LLM 呼び出しに失敗しました。');
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
