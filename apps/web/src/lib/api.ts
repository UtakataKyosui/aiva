import type {
  CreateMealFromShortcutInput,
  DailySuggestionResponse,
  IngredientInput,
  IngredientRecord,
  LlmCatalogPreviewInput,
  LlmCatalogResponse,
  LlmProvider,
  MealLogInput,
  MealLogRecord,
  MealShortcutInput,
  MealShortcutRecord,
  SubscriptionProductInput,
  SubscriptionProductRecord,
  SubscriptionServiceInput,
  SubscriptionServiceRecord,
  UserLlmSettingsRecord,
  UserLlmSettingsUpdateInput,
  UserPreferencesInput,
} from '@aiva/shared';

export type SessionPayload = {
  user: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
  };
  session: {
    id: string;
    expiresAt: string;
  };
};

const API_BASE = import.meta.env.PUBLIC_API_BASE_URL ?? 'http://localhost:4112';

const request = async <T>(path: string, init?: RequestInit) => {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (response.status === 204) {
    return null as T;
  }

  if (!response.ok) {
    const rawBody = await response.text();
    let message = rawBody || 'Request failed';

    try {
      const payload = JSON.parse(rawBody) as { message?: string };
      if (payload.message) {
        message = payload.message;
      }
    } catch {
      // Fall back to the raw response body for non-JSON errors.
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
};

export const api = {
  apiBase: API_BASE,
  getSession: () => request<SessionPayload>('/api/session'),
  getIngredients: () => request<IngredientRecord[]>('/api/ingredients'),
  createIngredient: (input: IngredientInput) =>
    request<IngredientRecord>('/api/ingredients', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateIngredient: (id: string, input: Partial<IngredientInput>) =>
    request<IngredientRecord>(`/api/ingredients/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  deleteIngredient: (id: string) =>
    request<{ ok: true }>(`/api/ingredients/${id}`, {
      method: 'DELETE',
    }),
  getSubscriptionServices: () =>
    request<SubscriptionServiceRecord[]>('/api/subscription-services'),
  createSubscriptionService: (input: SubscriptionServiceInput) =>
    request<SubscriptionServiceRecord>('/api/subscription-services', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateSubscriptionService: (
    id: string,
    input: Partial<SubscriptionServiceInput>,
  ) =>
    request<SubscriptionServiceRecord>(`/api/subscription-services/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  deleteSubscriptionService: (id: string) =>
    request<{ ok: true }>(`/api/subscription-services/${id}`, {
      method: 'DELETE',
    }),
  getSubscriptionProducts: () =>
    request<SubscriptionProductRecord[]>('/api/subscription-products'),
  createSubscriptionProduct: (input: SubscriptionProductInput) =>
    request<SubscriptionProductRecord>('/api/subscription-products', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateSubscriptionProduct: (
    id: string,
    input: Partial<SubscriptionProductInput>,
  ) =>
    request<SubscriptionProductRecord>(`/api/subscription-products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  deleteSubscriptionProduct: (id: string) =>
    request<{ ok: true }>(`/api/subscription-products/${id}`, {
      method: 'DELETE',
    }),
  getMealShortcuts: () => request<MealShortcutRecord[]>('/api/meal-shortcuts'),
  createMealShortcut: (input: MealShortcutInput) =>
    request<MealShortcutRecord>('/api/meal-shortcuts', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateMealShortcut: (id: string, input: MealShortcutInput) =>
    request<MealShortcutRecord>(`/api/meal-shortcuts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  deleteMealShortcut: (id: string) =>
    request<{ ok: true }>(`/api/meal-shortcuts/${id}`, {
      method: 'DELETE',
    }),
  getMeals: () => request<MealLogRecord[]>('/api/meals'),
  createMeal: (input: MealLogInput) =>
    request<MealLogRecord>('/api/meals', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  createMealFromShortcut: (input: CreateMealFromShortcutInput) =>
    request<MealLogRecord>('/api/meals/from-shortcut', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateMeal: (id: string, input: Partial<MealLogInput>) =>
    request<MealLogRecord>(`/api/meals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  deleteMeal: (id: string) =>
    request<{ ok: true }>(`/api/meals/${id}`, {
      method: 'DELETE',
    }),
  getPreferences: () => request<UserPreferencesInput>('/api/preferences'),
  savePreferences: (input: UserPreferencesInput) =>
    request<UserPreferencesInput>('/api/preferences', {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  getLlmSettings: () => request<UserLlmSettingsRecord>('/api/llm-settings'),
  saveLlmSettings: (input: UserLlmSettingsUpdateInput) =>
    request<UserLlmSettingsRecord>('/api/llm-settings', {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  getLlmModels: (provider: LlmProvider) =>
    request<LlmCatalogResponse>(`/api/llm-models?provider=${provider}`),
  previewLlmModels: (input: LlmCatalogPreviewInput) =>
    request<LlmCatalogResponse>('/api/llm-models/preview', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  getTodaySuggestion: () =>
    request<DailySuggestionResponse | null>('/api/suggestions/today'),
  generateTodaySuggestion: () =>
    request<DailySuggestionResponse>('/api/suggestions/today', {
      method: 'POST',
    }),
};
