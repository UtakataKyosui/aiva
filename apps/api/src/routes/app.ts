import {
  dailySuggestionResponseSchema,
  ingredientInputSchema,
  mealLogInputSchema,
  userPreferencesInputSchema,
} from '@aiva/shared';
import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { requireSession } from '../auth/session.js';
import { db } from '../db/client.js';
import { ingredients, mealLogs, suggestionRuns, userPreferences } from '../db/schema.js';
import { getTodayInJapan } from '../lib/date.js';
import { mastra } from '../mastra/index.js';

const idSchema = z.object({
  id: z.string().uuid(),
});

export const appRoutes = new Hono();

appRoutes.get('/session', async (context) => {
  const session = await requireSession(context);
  return context.json(session);
});

appRoutes.get('/ingredients', async (context) => {
  const { user } = await requireSession(context);
  const rows = await db.query.ingredients.findMany({
    where: eq(ingredients.userId, user.id),
    orderBy: [ingredients.expiresOn, ingredients.name],
  });

  return context.json(
    rows.map((row) => ({
      ...row,
      quantity: Number(row.quantity),
      calories: row.calories === null ? null : Number(row.calories),
      protein: row.protein === null ? null : Number(row.protein),
      fat: row.fat === null ? null : Number(row.fat),
      carbs: row.carbs === null ? null : Number(row.carbs),
    })),
  );
});

appRoutes.post('/ingredients', async (context) => {
  const { user } = await requireSession(context);
  const payload = ingredientInputSchema.parse(await context.req.json());

  const [created] = await db
    .insert(ingredients)
    .values({
      id: crypto.randomUUID(),
      userId: user.id,
      ...payload,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return context.json(created, 201);
});

appRoutes.patch('/ingredients/:id', async (context) => {
  const { user } = await requireSession(context);
  const { id } = idSchema.parse(context.req.param());
  const payload = ingredientInputSchema.partial().parse(await context.req.json());

  const [updated] = await db
    .update(ingredients)
    .set({
      ...payload,
      updatedAt: new Date(),
    })
    .where(and(eq(ingredients.id, id), eq(ingredients.userId, user.id)))
    .returning();

  if (!updated) {
    throw new HTTPException(404, { message: 'Ingredient not found' });
  }

  return context.json(updated);
});

appRoutes.delete('/ingredients/:id', async (context) => {
  const { user } = await requireSession(context);
  const { id } = idSchema.parse(context.req.param());

  const [deleted] = await db
    .delete(ingredients)
    .where(and(eq(ingredients.id, id), eq(ingredients.userId, user.id)))
    .returning({ id: ingredients.id });

  if (!deleted) {
    throw new HTTPException(404, { message: 'Ingredient not found' });
  }

  return context.json({ ok: true });
});

appRoutes.get('/meals', async (context) => {
  const { user } = await requireSession(context);
  const rows = await db.query.mealLogs.findMany({
    where: eq(mealLogs.userId, user.id),
    orderBy: [desc(mealLogs.consumedOn), desc(mealLogs.createdAt)],
  });

  return context.json(rows);
});

appRoutes.post('/meals', async (context) => {
  const { user } = await requireSession(context);
  const payload = mealLogInputSchema.parse(await context.req.json());

  const [created] = await db
    .insert(mealLogs)
    .values({
      id: crypto.randomUUID(),
      userId: user.id,
      ...payload,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return context.json(created, 201);
});

appRoutes.patch('/meals/:id', async (context) => {
  const { user } = await requireSession(context);
  const { id } = idSchema.parse(context.req.param());
  const payload = mealLogInputSchema.partial().parse(await context.req.json());

  const [updated] = await db
    .update(mealLogs)
    .set({
      ...payload,
      updatedAt: new Date(),
    })
    .where(and(eq(mealLogs.id, id), eq(mealLogs.userId, user.id)))
    .returning();

  if (!updated) {
    throw new HTTPException(404, { message: 'Meal log not found' });
  }

  return context.json(updated);
});

appRoutes.delete('/meals/:id', async (context) => {
  const { user } = await requireSession(context);
  const { id } = idSchema.parse(context.req.param());

  const [deleted] = await db
    .delete(mealLogs)
    .where(and(eq(mealLogs.id, id), eq(mealLogs.userId, user.id)))
    .returning({ id: mealLogs.id });

  if (!deleted) {
    throw new HTTPException(404, { message: 'Meal log not found' });
  }

  return context.json({ ok: true });
});

appRoutes.get('/preferences', async (context) => {
  const { user } = await requireSession(context);
  const preference = await db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, user.id),
  });

  if (!preference) {
    return context.json({
      allergies: [],
      dislikes: [],
      note: null,
    });
  }

  return context.json({
    allergies: preference.allergies,
    dislikes: preference.dislikes,
    note: preference.note,
  });
});

appRoutes.put('/preferences', async (context) => {
  const { user } = await requireSession(context);
  const payload = userPreferencesInputSchema.parse(await context.req.json());

  const existing = await db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, user.id),
  });

  const values = {
    userId: user.id,
    allergies: payload.allergies,
    dislikes: payload.dislikes,
    note: payload.note,
    updatedAt: new Date(),
  };

  if (existing) {
    const [updated] = await db
      .update(userPreferences)
      .set(values)
      .where(eq(userPreferences.userId, user.id))
      .returning();

    return context.json(updated);
  }

  const [created] = await db
    .insert(userPreferences)
    .values({
      id: crypto.randomUUID(),
      ...values,
      createdAt: new Date(),
    })
    .returning();

  return context.json(created, 201);
});

appRoutes.get('/suggestions/today', async (context) => {
  const { user } = await requireSession(context);
  const today = getTodayInJapan();

  const latest = await db.query.suggestionRuns.findFirst({
    where: and(eq(suggestionRuns.userId, user.id), eq(suggestionRuns.suggestionDate, today)),
    orderBy: [desc(suggestionRuns.createdAt)],
  });

  if (!latest) {
    return context.json(null);
  }

  return context.json(dailySuggestionResponseSchema.parse(latest.result));
});

appRoutes.post('/suggestions/today', async (context) => {
  const { user } = await requireSession(context);
  const today = getTodayInJapan();
  const workflow = mastra.getWorkflow('dailySuggestionWorkflow');

  if (!workflow) {
    throw new HTTPException(500, { message: 'Suggestion workflow is not configured' });
  }

  const run = await workflow.createRun({
    resourceId: user.id,
  });

  const result = await run.start({
    inputData: {
      userId: user.id,
      suggestionDate: today,
    },
  });

  if (result.status !== 'success') {
    throw new HTTPException(500, { message: 'Failed to generate suggestion' });
  }

  return context.json(dailySuggestionResponseSchema.parse(result.result));
});
