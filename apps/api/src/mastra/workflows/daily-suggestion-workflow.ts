import { dailySuggestionResponseSchema } from '@aiva/shared';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { ingredients, mealLogs, suggestionRuns, userPreferences } from '../../db/schema.js';
import { env } from '../../env.js';
import {
  buildSuggestionPrompt,
  createFallbackSuggestion,
  generatedMealPlanSchema,
  rankIngredients,
} from '../../domain/suggestions.js';
import { mealSuggestionAgent } from '../agents/meal-suggestion-agent.js';
import { and, desc, eq, gte } from 'drizzle-orm';

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

    const [ingredientRows, mealRows, preferenceRow] = await Promise.all([
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
    ]);

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
    };
  },
});

const scoreIngredients = createStep({
  id: 'score-ingredients',
  inputSchema: collectedContextSchema,
  outputSchema: prioritizedContextSchema,
  execute: async ({ inputData }) => {
    const priorities = rankIngredients(inputData);
    const { prompt, recentPattern } = buildSuggestionPrompt(inputData, priorities);

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
    if (!env.OPENAI_API_KEY) {
      return {
        ...createFallbackSuggestion(inputData, inputData.priorities),
        userId: inputData.userId,
        prompt: inputData.prompt,
      };
    }

    try {
      const response = await mealSuggestionAgent.generate(inputData.prompt, {
        structuredOutput: {
          schema: generatedMealPlanSchema,
        },
      });

      if (!response.object) {
        return {
          ...createFallbackSuggestion(inputData, inputData.priorities),
          userId: inputData.userId,
          prompt: inputData.prompt,
        };
      }

      return persistedSuggestionSchema.parse({
        suggestionDate: inputData.suggestionDate,
        generatedAt: new Date().toISOString(),
        priorities: inputData.priorities,
        recentPattern: inputData.recentPattern,
        meals: response.object.meals,
        note: response.object.note,
        userId: inputData.userId,
        prompt: inputData.prompt,
      });
    } catch (error) {
      console.error('Failed to generate AI suggestion, using fallback.', error);
      return {
        ...createFallbackSuggestion(inputData, inputData.priorities),
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
      inputBrief: {
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
