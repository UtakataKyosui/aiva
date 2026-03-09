import {
  createMealFromShortcutInputSchema,
  dailySuggestionResponseSchema,
  ingredientInputSchema,
  llmCatalogPreviewInputSchema,
  llmCatalogResponseSchema,
  llmProviderSchema,
  mealLogInputSchema,
  mealLogRecordSchema,
  mealShortcutInputSchema,
  mealShortcutItemRecordSchema,
  mealShortcutRecordSchema,
  subscriptionProductInputSchema,
  subscriptionProductRecordSchema,
  subscriptionServiceInputSchema,
  subscriptionServiceRecordSchema,
  userLlmSettingsRecordSchema,
  userLlmSettingsUpdateInputSchema,
  userPreferencesInputSchema,
} from '@aiva/shared';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { requireSession } from '../auth/session';
import { db } from '../db/client';
import {
  ingredients,
  mealLogs,
  mealShortcutItems,
  mealShortcuts,
  subscriptionProducts,
  subscriptionServices,
  suggestionRuns,
  userLlmSettings,
  userPreferences,
} from '../db/schema';
import {
  buildConsumedSnapshot,
  computeShortcutNutrition,
  findShortcutStockIssue,
} from '../domain/subscription-shortcuts';
import { isFallbackSuggestionResult } from '../domain/suggestions';
import { getTodayInJapan } from '../lib/date';
import {
  buildCredentialStatusMap,
  getModelCatalog,
  resolveProviderApiKey,
  resolveStoredLlmSettings,
  validateLlmSettings,
  withoutStoredProviderApiKey,
  withStoredProviderApiKey,
} from '../lib/llm';

const idSchema = z.object({
  id: z.string().uuid(),
});

const llmCatalogQuerySchema = z.object({
  provider: llmProviderSchema,
});

const serializeIngredient = (row: typeof ingredients.$inferSelect) => ({
  ...row,
  quantity: Number(row.quantity),
  calories: row.calories === null ? null : Number(row.calories),
  protein: row.protein === null ? null : Number(row.protein),
  fat: row.fat === null ? null : Number(row.fat),
  carbs: row.carbs === null ? null : Number(row.carbs),
});

const serializeMealLog = (row: typeof mealLogs.$inferSelect) => {
  return mealLogRecordSchema.parse({
    ...row,
    sourceType: row.sourceType,
    shortcutId: row.shortcutId,
    calories: row.calories === null ? null : Number(row.calories),
    protein: row.protein === null ? null : Number(row.protein),
    fat: row.fat === null ? null : Number(row.fat),
    carbs: row.carbs === null ? null : Number(row.carbs),
    consumedSnapshot: row.consumedSnapshot,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
};

const serializeSubscriptionService = (
  row: typeof subscriptionServices.$inferSelect,
) => {
  return subscriptionServiceRecordSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
};

const serializeSubscriptionProduct = (row: {
  id: string;
  serviceId: string;
  serviceName: string;
  name: string;
  sku: string | null;
  stockQuantity: number;
  stockUnit: string;
  calories: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}) => {
  return subscriptionProductRecordSchema.parse({
    id: row.id,
    serviceId: row.serviceId,
    serviceName: row.serviceName,
    name: row.name,
    sku: row.sku,
    stockQuantity: Number(row.stockQuantity),
    stockUnit: row.stockUnit,
    calories: row.calories === null ? null : Number(row.calories),
    protein: row.protein === null ? null : Number(row.protein),
    fat: row.fat === null ? null : Number(row.fat),
    carbs: row.carbs === null ? null : Number(row.carbs),
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
};

const formatShortcutStockMessage = (issue: {
  productName: string;
  required: number;
  available: number;
}) => {
  return `${issue.productName}の在庫が不足しています。必要 ${issue.required} / 現在 ${issue.available}`;
};

const loadSubscriptionProductById = async (
  userId: string,
  productId: string,
) => {
  const row = await db
    .select({
      id: subscriptionProducts.id,
      serviceId: subscriptionProducts.serviceId,
      serviceName: subscriptionServices.name,
      name: subscriptionProducts.name,
      sku: subscriptionProducts.sku,
      stockQuantity: subscriptionProducts.stockQuantity,
      stockUnit: subscriptionProducts.stockUnit,
      calories: subscriptionProducts.calories,
      protein: subscriptionProducts.protein,
      fat: subscriptionProducts.fat,
      carbs: subscriptionProducts.carbs,
      notes: subscriptionProducts.notes,
      createdAt: subscriptionProducts.createdAt,
      updatedAt: subscriptionProducts.updatedAt,
    })
    .from(subscriptionProducts)
    .innerJoin(
      subscriptionServices,
      eq(subscriptionProducts.serviceId, subscriptionServices.id),
    )
    .where(
      and(
        eq(subscriptionProducts.userId, userId),
        eq(subscriptionProducts.id, productId),
      ),
    )
    .then((rows) => rows[0] ?? null);

  return row ? serializeSubscriptionProduct(row) : null;
};

const assertSubscriptionService = async (userId: string, serviceId: string) => {
  const service = await db.query.subscriptionServices.findFirst({
    where: and(
      eq(subscriptionServices.userId, userId),
      eq(subscriptionServices.id, serviceId),
    ),
  });

  if (!service) {
    throw new HTTPException(404, { message: 'Subscription service not found' });
  }

  return service;
};

const validateShortcutDependencies = async (
  userId: string,
  payload: z.infer<typeof mealShortcutInputSchema>,
) => {
  if (payload.serviceId) {
    await assertSubscriptionService(userId, payload.serviceId);
  }

  const productIds = payload.items.map((item) => item.productId);

  const productRows =
    productIds.length === 0
      ? []
      : await db
          .select({
            id: subscriptionProducts.id,
            serviceId: subscriptionProducts.serviceId,
          })
          .from(subscriptionProducts)
          .where(
            and(
              eq(subscriptionProducts.userId, userId),
              inArray(subscriptionProducts.id, productIds),
            ),
          );

  if (productRows.length !== productIds.length) {
    throw new HTTPException(400, {
      message: 'ショートカット内の商品参照が無効です。',
    });
  }

  if (
    payload.serviceId &&
    productRows.some((product) => product.serviceId !== payload.serviceId)
  ) {
    throw new HTTPException(400, {
      message:
        'サービスを指定したショートカットには同じサービスの商品だけを登録してください。',
    });
  }
};

const loadMealShortcutRecords = async (userId: string, shortcutId?: string) => {
  const shortcutCondition = shortcutId
    ? and(eq(mealShortcuts.userId, userId), eq(mealShortcuts.id, shortcutId))
    : eq(mealShortcuts.userId, userId);

  const shortcuts = await db
    .select({
      id: mealShortcuts.id,
      serviceId: mealShortcuts.serviceId,
      serviceName: subscriptionServices.name,
      name: mealShortcuts.name,
      notes: mealShortcuts.notes,
      createdAt: mealShortcuts.createdAt,
      updatedAt: mealShortcuts.updatedAt,
    })
    .from(mealShortcuts)
    .leftJoin(
      subscriptionServices,
      eq(mealShortcuts.serviceId, subscriptionServices.id),
    )
    .where(shortcutCondition)
    .orderBy(asc(mealShortcuts.createdAt));

  if (!shortcuts.length) {
    return [];
  }

  const shortcutIds = shortcuts.map((shortcut) => shortcut.id);
  const items = await db
    .select({
      id: mealShortcutItems.id,
      shortcutId: mealShortcutItems.shortcutId,
      quantity: mealShortcutItems.quantity,
      createdAt: mealShortcutItems.createdAt,
      updatedAt: mealShortcutItems.updatedAt,
      productId: subscriptionProducts.id,
      serviceId: subscriptionServices.id,
      serviceName: subscriptionServices.name,
      productName: subscriptionProducts.name,
      stockQuantity: subscriptionProducts.stockQuantity,
      stockUnit: subscriptionProducts.stockUnit,
      calories: subscriptionProducts.calories,
      protein: subscriptionProducts.protein,
      fat: subscriptionProducts.fat,
      carbs: subscriptionProducts.carbs,
    })
    .from(mealShortcutItems)
    .innerJoin(
      subscriptionProducts,
      eq(mealShortcutItems.productId, subscriptionProducts.id),
    )
    .leftJoin(
      subscriptionServices,
      eq(subscriptionProducts.serviceId, subscriptionServices.id),
    )
    .where(inArray(mealShortcutItems.shortcutId, shortcutIds))
    .orderBy(asc(mealShortcutItems.createdAt));

  const groupedItems = new Map<string, typeof items>();
  for (const item of items) {
    const current = groupedItems.get(item.shortcutId) ?? [];
    current.push(item);
    groupedItems.set(item.shortcutId, current);
  }

  return shortcuts.map((shortcut) => {
    const shortcutItems = (groupedItems.get(shortcut.id) ?? []).map((item) =>
      mealShortcutItemRecordSchema.parse({
        id: item.id,
        productId: item.productId,
        quantity: Number(item.quantity),
        serviceId: item.serviceId,
        serviceName: item.serviceName,
        productName: item.productName,
        stockQuantity: Number(item.stockQuantity),
        stockUnit: item.stockUnit,
        calories: item.calories === null ? null : Number(item.calories),
        protein: item.protein === null ? null : Number(item.protein),
        fat: item.fat === null ? null : Number(item.fat),
        carbs: item.carbs === null ? null : Number(item.carbs),
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      }),
    );

    return mealShortcutRecordSchema.parse({
      id: shortcut.id,
      serviceId: shortcut.serviceId,
      serviceName: shortcut.serviceName,
      name: shortcut.name,
      notes: shortcut.notes,
      items: shortcutItems,
      totals: computeShortcutNutrition(
        shortcutItems.map((item) => ({
          productId: item.productId,
          serviceId: item.serviceId,
          serviceName: item.serviceName,
          productName: item.productName,
          quantity: item.quantity,
          stockQuantity: item.stockQuantity,
          stockUnit: item.stockUnit,
          calories: item.calories,
          protein: item.protein,
          fat: item.fat,
          carbs: item.carbs,
        })),
      ),
      createdAt: shortcut.createdAt.toISOString(),
      updatedAt: shortcut.updatedAt.toISOString(),
    });
  });
};

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

  return context.json(rows.map(serializeIngredient));
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

  return context.json(serializeIngredient(created), 201);
});

appRoutes.patch('/ingredients/:id', async (context) => {
  const { user } = await requireSession(context);
  const { id } = idSchema.parse(context.req.param());
  const payload = ingredientInputSchema
    .partial()
    .parse(await context.req.json());

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

  return context.json(serializeIngredient(updated));
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

appRoutes.get('/subscription-services', async (context) => {
  const { user } = await requireSession(context);
  const rows = await db.query.subscriptionServices.findMany({
    where: eq(subscriptionServices.userId, user.id),
    orderBy: [subscriptionServices.createdAt],
  });

  return context.json(rows.map(serializeSubscriptionService));
});

appRoutes.post('/subscription-services', async (context) => {
  const { user } = await requireSession(context);
  const payload = subscriptionServiceInputSchema.parse(
    await context.req.json(),
  );

  const [created] = await db
    .insert(subscriptionServices)
    .values({
      id: crypto.randomUUID(),
      userId: user.id,
      ...payload,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return context.json(serializeSubscriptionService(created), 201);
});

appRoutes.patch('/subscription-services/:id', async (context) => {
  const { user } = await requireSession(context);
  const { id } = idSchema.parse(context.req.param());
  const payload = subscriptionServiceInputSchema
    .partial()
    .parse(await context.req.json());

  const [updated] = await db
    .update(subscriptionServices)
    .set({
      ...payload,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(subscriptionServices.id, id),
        eq(subscriptionServices.userId, user.id),
      ),
    )
    .returning();

  if (!updated) {
    throw new HTTPException(404, {
      message: 'Subscription service not found',
    });
  }

  return context.json(serializeSubscriptionService(updated));
});

appRoutes.delete('/subscription-services/:id', async (context) => {
  const { user } = await requireSession(context);
  const { id } = idSchema.parse(context.req.param());

  const [deleted] = await db
    .delete(subscriptionServices)
    .where(
      and(
        eq(subscriptionServices.id, id),
        eq(subscriptionServices.userId, user.id),
      ),
    )
    .returning({ id: subscriptionServices.id });

  if (!deleted) {
    throw new HTTPException(404, {
      message: 'Subscription service not found',
    });
  }

  return context.json({ ok: true });
});

appRoutes.get('/subscription-products', async (context) => {
  const { user } = await requireSession(context);
  const rows = await db
    .select({
      id: subscriptionProducts.id,
      serviceId: subscriptionProducts.serviceId,
      serviceName: subscriptionServices.name,
      name: subscriptionProducts.name,
      sku: subscriptionProducts.sku,
      stockQuantity: subscriptionProducts.stockQuantity,
      stockUnit: subscriptionProducts.stockUnit,
      calories: subscriptionProducts.calories,
      protein: subscriptionProducts.protein,
      fat: subscriptionProducts.fat,
      carbs: subscriptionProducts.carbs,
      notes: subscriptionProducts.notes,
      createdAt: subscriptionProducts.createdAt,
      updatedAt: subscriptionProducts.updatedAt,
    })
    .from(subscriptionProducts)
    .innerJoin(
      subscriptionServices,
      eq(subscriptionProducts.serviceId, subscriptionServices.id),
    )
    .where(eq(subscriptionProducts.userId, user.id))
    .orderBy(
      asc(subscriptionServices.createdAt),
      asc(subscriptionProducts.createdAt),
    );

  return context.json(rows.map(serializeSubscriptionProduct));
});

appRoutes.post('/subscription-products', async (context) => {
  const { user } = await requireSession(context);
  const payload = subscriptionProductInputSchema.parse(
    await context.req.json(),
  );

  await assertSubscriptionService(user.id, payload.serviceId);

  const [created] = await db
    .insert(subscriptionProducts)
    .values({
      id: crypto.randomUUID(),
      userId: user.id,
      ...payload,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  const row = await loadSubscriptionProductById(user.id, created.id);

  if (!row) {
    throw new HTTPException(500, {
      message: 'Failed to load created subscription product',
    });
  }

  return context.json(row, 201);
});

appRoutes.patch('/subscription-products/:id', async (context) => {
  const { user } = await requireSession(context);
  const { id } = idSchema.parse(context.req.param());
  const payload = subscriptionProductInputSchema
    .partial()
    .parse(await context.req.json());

  if (payload.serviceId) {
    await assertSubscriptionService(user.id, payload.serviceId);
  }

  const [updated] = await db
    .update(subscriptionProducts)
    .set({
      ...payload,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(subscriptionProducts.id, id),
        eq(subscriptionProducts.userId, user.id),
      ),
    )
    .returning();

  if (!updated) {
    throw new HTTPException(404, {
      message: 'Subscription product not found',
    });
  }

  const row = await loadSubscriptionProductById(user.id, updated.id);

  if (!row) {
    throw new HTTPException(500, {
      message: 'Failed to load updated subscription product',
    });
  }

  return context.json(row);
});

appRoutes.delete('/subscription-products/:id', async (context) => {
  const { user } = await requireSession(context);
  const { id } = idSchema.parse(context.req.param());

  const [deleted] = await db
    .delete(subscriptionProducts)
    .where(
      and(
        eq(subscriptionProducts.id, id),
        eq(subscriptionProducts.userId, user.id),
      ),
    )
    .returning({ id: subscriptionProducts.id });

  if (!deleted) {
    throw new HTTPException(404, {
      message: 'Subscription product not found',
    });
  }

  return context.json({ ok: true });
});

appRoutes.get('/meal-shortcuts', async (context) => {
  const { user } = await requireSession(context);
  return context.json(await loadMealShortcutRecords(user.id));
});

appRoutes.post('/meal-shortcuts', async (context) => {
  const { user } = await requireSession(context);
  const payload = mealShortcutInputSchema.parse(await context.req.json());

  await validateShortcutDependencies(user.id, payload);

  const shortcutId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(mealShortcuts).values({
      id: shortcutId,
      userId: user.id,
      serviceId: payload.serviceId,
      name: payload.name,
      notes: payload.notes,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await tx.insert(mealShortcutItems).values(
      payload.items.map((item) => ({
        id: crypto.randomUUID(),
        shortcutId,
        productId: item.productId,
        quantity: item.quantity,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    );
  });

  const created = await loadMealShortcutRecords(user.id, shortcutId);
  return context.json(created[0], 201);
});

appRoutes.patch('/meal-shortcuts/:id', async (context) => {
  const { user } = await requireSession(context);
  const { id } = idSchema.parse(context.req.param());
  const payload = mealShortcutInputSchema.parse(await context.req.json());

  const existing = await db.query.mealShortcuts.findFirst({
    where: and(eq(mealShortcuts.id, id), eq(mealShortcuts.userId, user.id)),
  });

  if (!existing) {
    throw new HTTPException(404, { message: 'Meal shortcut not found' });
  }

  await validateShortcutDependencies(user.id, payload);

  await db.transaction(async (tx) => {
    await tx
      .update(mealShortcuts)
      .set({
        serviceId: payload.serviceId,
        name: payload.name,
        notes: payload.notes,
        updatedAt: new Date(),
      })
      .where(eq(mealShortcuts.id, id));

    await tx
      .delete(mealShortcutItems)
      .where(eq(mealShortcutItems.shortcutId, id));

    await tx.insert(mealShortcutItems).values(
      payload.items.map((item) => ({
        id: crypto.randomUUID(),
        shortcutId: id,
        productId: item.productId,
        quantity: item.quantity,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    );
  });

  const updated = await loadMealShortcutRecords(user.id, id);
  return context.json(updated[0]);
});

appRoutes.delete('/meal-shortcuts/:id', async (context) => {
  const { user } = await requireSession(context);
  const { id } = idSchema.parse(context.req.param());

  const [deleted] = await db
    .delete(mealShortcuts)
    .where(and(eq(mealShortcuts.id, id), eq(mealShortcuts.userId, user.id)))
    .returning({ id: mealShortcuts.id });

  if (!deleted) {
    throw new HTTPException(404, { message: 'Meal shortcut not found' });
  }

  return context.json({ ok: true });
});

appRoutes.get('/meals', async (context) => {
  const { user } = await requireSession(context);
  const rows = await db.query.mealLogs.findMany({
    where: eq(mealLogs.userId, user.id),
    orderBy: [desc(mealLogs.consumedOn), desc(mealLogs.createdAt)],
  });

  return context.json(rows.map(serializeMealLog));
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
      sourceType: 'manual',
      shortcutId: null,
      calories: null,
      protein: null,
      fat: null,
      carbs: null,
      consumedSnapshot: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return context.json(serializeMealLog(created), 201);
});

appRoutes.post('/meals/from-shortcut', async (context) => {
  const { user } = await requireSession(context);
  const payload = createMealFromShortcutInputSchema.parse(
    await context.req.json(),
  );

  const created = await db.transaction(async (tx) => {
    const shortcut = await tx.query.mealShortcuts.findFirst({
      where: and(
        eq(mealShortcuts.id, payload.shortcutId),
        eq(mealShortcuts.userId, user.id),
      ),
    });

    if (!shortcut) {
      throw new HTTPException(404, { message: 'Meal shortcut not found' });
    }

    const rows = await tx
      .select({
        productId: subscriptionProducts.id,
        serviceId: subscriptionServices.id,
        serviceName: subscriptionServices.name,
        productName: subscriptionProducts.name,
        quantity: mealShortcutItems.quantity,
        stockQuantity: subscriptionProducts.stockQuantity,
        stockUnit: subscriptionProducts.stockUnit,
        calories: subscriptionProducts.calories,
        protein: subscriptionProducts.protein,
        fat: subscriptionProducts.fat,
        carbs: subscriptionProducts.carbs,
      })
      .from(mealShortcutItems)
      .innerJoin(
        subscriptionProducts,
        eq(mealShortcutItems.productId, subscriptionProducts.id),
      )
      .leftJoin(
        subscriptionServices,
        eq(subscriptionProducts.serviceId, subscriptionServices.id),
      )
      .where(
        and(
          eq(mealShortcutItems.shortcutId, payload.shortcutId),
          eq(subscriptionProducts.userId, user.id),
        ),
      )
      .orderBy(asc(mealShortcutItems.createdAt));

    if (!rows.length) {
      throw new HTTPException(400, {
        message: '商品が登録されていないため実行できません。',
      });
    }

    const resolvedItems = rows.map((row) => ({
      productId: row.productId,
      serviceId: row.serviceId,
      serviceName: row.serviceName,
      productName: row.productName,
      quantity: Number(row.quantity),
      stockQuantity: Number(row.stockQuantity),
      stockUnit: row.stockUnit as
        | 'g'
        | 'kg'
        | 'ml'
        | 'l'
        | '個'
        | '本'
        | '袋'
        | 'パック'
        | '枚'
        | '食分',
      calories: row.calories === null ? null : Number(row.calories),
      protein: row.protein === null ? null : Number(row.protein),
      fat: row.fat === null ? null : Number(row.fat),
      carbs: row.carbs === null ? null : Number(row.carbs),
    }));

    const stockIssue = findShortcutStockIssue(resolvedItems);
    if (stockIssue) {
      throw new HTTPException(400, {
        message: formatShortcutStockMessage(stockIssue),
      });
    }

    const totals = computeShortcutNutrition(resolvedItems);
    const timestamp = new Date();
    const [mealLog] = await tx
      .insert(mealLogs)
      .values({
        id: crypto.randomUUID(),
        userId: user.id,
        consumedOn: payload.consumedOn,
        mealType: payload.mealType,
        menuName: shortcut.name,
        sourceType: 'shortcut',
        shortcutId: shortcut.id,
        calories: totals.calories,
        protein: totals.protein,
        fat: totals.fat,
        carbs: totals.carbs,
        consumedSnapshot: buildConsumedSnapshot(resolvedItems),
        satisfaction: payload.satisfaction,
        note: payload.note,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning();

    for (const item of resolvedItems) {
      await tx
        .update(subscriptionProducts)
        .set({
          stockQuantity: item.stockQuantity - item.quantity,
          updatedAt: timestamp,
        })
        .where(
          and(
            eq(subscriptionProducts.id, item.productId),
            eq(subscriptionProducts.userId, user.id),
          ),
        );
    }

    return mealLog;
  });

  return context.json(serializeMealLog(created), 201);
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

  return context.json(serializeMealLog(updated));
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
      notes: [],
    });
  }

  return context.json({
    allergies: preference.allergies,
    dislikes: preference.dislikes,
    notes: preference.notes,
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
    notes: payload.notes,
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

appRoutes.get('/llm-settings', async (context) => {
  const { user } = await requireSession(context);

  const existing = await db.query.userLlmSettings.findFirst({
    where: eq(userLlmSettings.userId, user.id),
  });

  const resolved = await resolveStoredLlmSettings(
    existing
      ? {
          provider: llmProviderSchema.parse(existing.provider),
          modelId: existing.modelId,
        }
      : null,
    {
      providerKeys: existing?.providerKeys,
    },
  );

  return context.json(
    userLlmSettingsRecordSchema.parse({
      provider: resolved.provider,
      modelId: resolved.modelId,
      updatedAt: existing?.updatedAt.toISOString() ?? null,
      credentialStatus: buildCredentialStatusMap(existing?.providerKeys),
    }),
  );
});

appRoutes.put('/llm-settings', async (context) => {
  const { user } = await requireSession(context);
  const payload = userLlmSettingsUpdateInputSchema.parse(
    await context.req.json(),
  );

  const existing = await db.query.userLlmSettings.findFirst({
    where: eq(userLlmSettings.userId, user.id),
  });

  let providerKeys = existing?.providerKeys ?? {};

  if (payload.clearStoredApiKey) {
    providerKeys = withoutStoredProviderApiKey(providerKeys, payload.provider);
  }

  if (payload.apiKey?.trim()) {
    providerKeys = withStoredProviderApiKey(
      providerKeys,
      payload.provider,
      payload.apiKey,
    );
  }

  const effectiveApiKey = resolveProviderApiKey(payload.provider, providerKeys);
  const validationError = await validateLlmSettings(
    {
      provider: payload.provider,
      modelId: payload.modelId,
    },
    {
      apiKey: effectiveApiKey,
    },
  ).catch((error) =>
    error instanceof Error ? error.message : 'モデル設定の検証に失敗しました。',
  );

  if (validationError) {
    throw new HTTPException(400, { message: validationError });
  }

  if (existing) {
    const [updated] = await db
      .update(userLlmSettings)
      .set({
        provider: payload.provider,
        modelId: payload.modelId,
        providerKeys,
        updatedAt: new Date(),
      })
      .where(eq(userLlmSettings.userId, user.id))
      .returning();

    return context.json(
      userLlmSettingsRecordSchema.parse({
        provider: updated.provider,
        modelId: updated.modelId,
        updatedAt: updated.updatedAt.toISOString(),
        credentialStatus: buildCredentialStatusMap(updated.providerKeys),
      }),
    );
  }

  const [created] = await db
    .insert(userLlmSettings)
    .values({
      id: crypto.randomUUID(),
      userId: user.id,
      provider: payload.provider,
      modelId: payload.modelId,
      providerKeys,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return context.json(
    userLlmSettingsRecordSchema.parse({
      provider: created.provider,
      modelId: created.modelId,
      updatedAt: created.updatedAt.toISOString(),
      credentialStatus: buildCredentialStatusMap(created.providerKeys),
    }),
    201,
  );
});

appRoutes.get('/llm-models', async (context) => {
  const { user } = await requireSession(context);
  const query = llmCatalogQuerySchema.parse(context.req.query());
  const existing = await db.query.userLlmSettings.findFirst({
    where: eq(userLlmSettings.userId, user.id),
  });

  try {
    const catalog = await getModelCatalog(query.provider, {
      apiKey: resolveProviderApiKey(query.provider, existing?.providerKeys),
    });
    return context.json(llmCatalogResponseSchema.parse(catalog));
  } catch (error) {
    throw new HTTPException(502, {
      message:
        error instanceof Error
          ? error.message
          : 'モデル一覧の取得に失敗しました。',
    });
  }
});

appRoutes.post('/llm-models/preview', async (context) => {
  await requireSession(context);
  const payload = llmCatalogPreviewInputSchema.parse(await context.req.json());

  try {
    const catalog = await getModelCatalog(payload.provider, {
      apiKey: payload.apiKey,
    });
    return context.json(llmCatalogResponseSchema.parse(catalog));
  } catch (error) {
    throw new HTTPException(502, {
      message:
        error instanceof Error
          ? error.message
          : '入力中のAPIキーでモデル一覧の取得に失敗しました。',
    });
  }
});

appRoutes.get('/suggestions/today', async (context) => {
  const { user } = await requireSession(context);
  const today = getTodayInJapan();

  const latest = await db.query.suggestionRuns.findFirst({
    where: and(
      eq(suggestionRuns.userId, user.id),
      eq(suggestionRuns.suggestionDate, today),
    ),
    orderBy: [desc(suggestionRuns.createdAt)],
  });

  if (!latest) {
    return context.json(null);
  }

  if (isFallbackSuggestionResult(latest.result)) {
    return context.json(null);
  }

  return context.json(
    dailySuggestionResponseSchema.parse({
      ...(latest.result as Record<string, unknown>),
      llm:
        (latest.result as Record<string, unknown>).llm ??
        (latest.llmProvider && latest.llmModelId
          ? {
              provider: latest.llmProvider,
              modelId: latest.llmModelId,
            }
          : null),
    }),
  );
});

appRoutes.post('/suggestions/today', async (context) => {
  const { user } = await requireSession(context);
  const today = getTodayInJapan();
  const { mastra } = await import('../mastra/index');
  const workflow = mastra.getWorkflow('dailySuggestionWorkflow');

  if (!workflow) {
    throw new HTTPException(500, {
      message: 'Suggestion workflow is not configured',
    });
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

  if (result.status === 'failed') {
    throw new HTTPException(400, {
      message:
        result.error instanceof Error
          ? result.error.message
          : '提案生成に失敗しました。',
    });
  }

  if (result.status !== 'success') {
    throw new HTTPException(500, { message: '提案生成に失敗しました。' });
  }

  return context.json(dailySuggestionResponseSchema.parse(result.result));
});
