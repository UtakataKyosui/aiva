import type {
  DailySuggestionResponse,
  IngredientInput,
  IngredientRecord,
  LlmCatalogResponse,
  LlmProvider,
  MealLogInput,
  MealLogRecord,
  UserLlmSettingsInput,
  UserLlmSettingsRecord,
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

    try {
      const payload = JSON.parse(rawBody) as { message?: string };
      throw new Error(payload.message || 'Request failed');
    } catch {
      throw new Error(rawBody || 'Request failed');
    }
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
  getMeals: () => request<MealLogRecord[]>('/api/meals'),
  createMeal: (input: MealLogInput) =>
    request<MealLogRecord>('/api/meals', {
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
  saveLlmSettings: (input: UserLlmSettingsInput) =>
    request<UserLlmSettingsRecord>('/api/llm-settings', {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  getLlmModels: (provider: LlmProvider) =>
    request<LlmCatalogResponse>(`/api/llm-models?provider=${provider}`),
  getTodaySuggestion: () => request<DailySuggestionResponse | null>('/api/suggestions/today'),
  generateTodaySuggestion: () =>
    request<DailySuggestionResponse>('/api/suggestions/today', {
      method: 'POST',
    }),
};
