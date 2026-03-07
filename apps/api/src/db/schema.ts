import {
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import * as authSchema from './auth-schema.js';

export * from './auth-schema.js';

type StoredProviderKey = {
  ciphertext: string;
  lastFour: string;
};

type ProviderKeyStore = Partial<
  Record<'openai' | 'openrouter', StoredProviderKey>
>;

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const userPreferences = pgTable(
  'user_preferences',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authSchema.user.id, { onDelete: 'cascade' }),
    allergies: jsonb('allergies').$type<string[]>().notNull().default([]),
    dislikes: jsonb('dislikes').$type<string[]>().notNull().default([]),
    notes: jsonb('notes').$type<string[]>().notNull().default([]),
    ...timestamps,
  },
  (table) => ({
    userUnique: uniqueIndex('user_preferences_user_id_idx').on(table.userId),
  }),
);

export const userLlmSettings = pgTable(
  'user_llm_settings',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authSchema.user.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    modelId: text('model_id').notNull(),
    providerKeys: jsonb('provider_keys')
      .$type<ProviderKeyStore>()
      .notNull()
      .default({}),
    ...timestamps,
  },
  (table) => ({
    userUnique: uniqueIndex('user_llm_settings_user_id_idx').on(table.userId),
  }),
);

export const ingredients = pgTable(
  'ingredients',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authSchema.user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    category: text('category').notNull(),
    quantity: doublePrecision('quantity').notNull(),
    unit: text('unit').notNull(),
    expiresOn: date('expires_on'),
    calories: doublePrecision('calories'),
    protein: doublePrecision('protein'),
    fat: doublePrecision('fat'),
    carbs: doublePrecision('carbs'),
    note: text('note'),
    ...timestamps,
  },
  (table) => ({
    userIdx: index('ingredients_user_id_idx').on(table.userId),
    expiresIdx: index('ingredients_expires_on_idx').on(table.expiresOn),
  }),
);

export const mealLogs = pgTable(
  'meal_logs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authSchema.user.id, { onDelete: 'cascade' }),
    consumedOn: date('consumed_on').notNull(),
    mealType: text('meal_type').notNull(),
    menuName: text('menu_name').notNull(),
    satisfaction: integer('satisfaction'),
    note: text('note'),
    ...timestamps,
  },
  (table) => ({
    userIdx: index('meal_logs_user_id_idx').on(table.userId),
    consumedOnIdx: index('meal_logs_consumed_on_idx').on(table.consumedOn),
  }),
);

export const suggestionRuns = pgTable(
  'suggestion_runs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authSchema.user.id, { onDelete: 'cascade' }),
    suggestionDate: date('suggestion_date').notNull(),
    llmProvider: text('llm_provider'),
    llmModelId: text('llm_model_id'),
    inputBrief: jsonb('input_brief').$type<Record<string, unknown>>().notNull(),
    result: jsonb('result').$type<Record<string, unknown>>().notNull(),
    ...timestamps,
  },
  (table) => ({
    userIdx: index('suggestion_runs_user_id_idx').on(table.userId),
    latestIdx: index('suggestion_runs_user_date_idx').on(
      table.userId,
      table.suggestionDate,
    ),
  }),
);

export const schema = {
  ...authSchema,
  userPreferences,
  userLlmSettings,
  ingredients,
  mealLogs,
  suggestionRuns,
};
