import type {
  DailySuggestionResponse,
  IngredientInput,
  IngredientRecord,
  LlmCatalogResponse,
  LlmModelOption,
  LlmProvider,
  MealLogInput,
  MealLogRecord,
  UserLlmSettingsInput,
  UserLlmSettingsRecord,
  UserPreferencesInput,
} from '@aiva/shared';
import { useEffect, useMemo, useState } from 'react';
import './App.css';
import { api, type SessionPayload } from './lib/api';

const ingredientCategories = [
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

const quantityUnits = ['g', 'kg', 'ml', 'l', '個', '本', '袋', 'パック', '枚', '食分'] as const;
const mealTypes = ['朝食', '昼食', '夕食', '間食'] as const;
const providerLabels: Record<LlmProvider, string> = {
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
};

const defaultIngredientForm = (): IngredientInput => ({
  name: '',
  category: '野菜',
  quantity: 1,
  unit: '個',
  expiresOn: null,
  calories: null,
  protein: null,
  fat: null,
  carbs: null,
  note: null,
});

const defaultMealForm = (): MealLogInput => ({
  consumedOn: new Date().toISOString().slice(0, 10),
  mealType: '夕食',
  menuName: '',
  satisfaction: 4,
  note: null,
});

const defaultPreferences = (): UserPreferencesInput => ({
  allergies: [],
  dislikes: [],
  note: null,
});

const defaultLlmSettings = (): UserLlmSettingsInput => ({
  provider: 'openai',
  modelId: 'gpt-5-mini',
});

const defaultLlmRecord = (): UserLlmSettingsRecord => ({
  ...defaultLlmSettings(),
  updatedAt: null,
});

const asNullableNumber = (value: string) => {
  return value === '' ? null : Number(value);
};

const asNullableText = (value: string) => {
  return value.trim() === '' ? null : value.trim();
};

const toTagString = (values: string[]) => values.join(', ');

const fromTagString = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const toErrorMessage = (error: unknown, fallback: string) => {
  return error instanceof Error ? error.message : fallback;
};

const createUnavailableCatalog = (
  provider: LlmProvider,
  reason: string,
): LlmCatalogResponse => ({
  provider,
  available: false,
  reason,
  models: [],
});

const formatLlmSelection = (settings?: UserLlmSettingsInput | null) => {
  if (!settings) {
    return '未記録';
  }

  return `${providerLabels[settings.provider]} / ${settings.modelId}`;
};

const fallbackModelOption = (modelId: string): LlmModelOption => ({
  id: modelId,
  name: `現在の保存値 (${modelId})`,
  description: '現在の catalog には含まれていません。',
  contextLength: null,
  supportsStructuredOutput: false,
});

const App = () => {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<IngredientRecord[]>([]);
  const [meals, setMeals] = useState<MealLogRecord[]>([]);
  const [preferences, setPreferences] = useState<UserPreferencesInput>(defaultPreferences());
  const [llmSettings, setLlmSettings] = useState<UserLlmSettingsRecord>(defaultLlmRecord());
  const [llmDraft, setLlmDraft] = useState<UserLlmSettingsInput>(defaultLlmSettings());
  const [llmCatalog, setLlmCatalog] = useState<LlmCatalogResponse | null>(null);
  const [llmCatalogLoading, setLlmCatalogLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<DailySuggestionResponse | null>(null);
  const [ingredientForm, setIngredientForm] = useState<IngredientInput>(defaultIngredientForm());
  const [mealForm, setMealForm] = useState<MealLogInput>(defaultMealForm());
  const [preferenceDraft, setPreferenceDraft] = useState({
    allergies: '',
    dislikes: '',
    note: '',
  });
  const [editingIngredientId, setEditingIngredientId] = useState<string | null>(null);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);

  const fetchLlmCatalog = async (provider: LlmProvider) => {
    try {
      return await api.getLlmModels(provider);
    } catch (nextError) {
      return createUnavailableCatalog(
        provider,
        toErrorMessage(nextError, 'モデル一覧の取得に失敗しました。'),
      );
    }
  };

  const loadSession = async () => {
    try {
      const nextSession = await api.getSession();
      setSession(nextSession);
      return nextSession;
    } catch {
      setSession(null);
      return null;
    }
  };

  const loadDashboard = async () => {
    setBusy(true);
    setError(null);

    try {
      const [
        nextIngredients,
        nextMeals,
        nextPreferences,
        nextSuggestion,
        nextLlmSettings,
      ] = await Promise.all([
        api.getIngredients(),
        api.getMeals(),
        api.getPreferences(),
        api.getTodaySuggestion(),
        api.getLlmSettings(),
      ]);

      const nextCatalog = await fetchLlmCatalog(nextLlmSettings.provider);

      setIngredients(nextIngredients);
      setMeals(nextMeals);
      setPreferences(nextPreferences);
      setLlmSettings(nextLlmSettings);
      setLlmDraft({
        provider: nextLlmSettings.provider,
        modelId: nextLlmSettings.modelId,
      });
      setLlmCatalog(nextCatalog);
      setPreferenceDraft({
        allergies: toTagString(nextPreferences.allergies),
        dislikes: toTagString(nextPreferences.dislikes),
        note: nextPreferences.note ?? '',
      });
      setSuggestion(nextSuggestion);
    } catch (nextError) {
      setError(toErrorMessage(nextError, 'データの取得に失敗しました。'));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      const nextSession = await loadSession();
      if (!active) {
        return;
      }

      if (nextSession) {
        await loadDashboard();
      }

      if (active) {
        setBooting(false);
      }
    };

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  const handleGoogleSignIn = async () => {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`${api.apiBase}/api/auth/sign-in/social`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: 'google',
          disableRedirect: true,
          callbackURL: window.location.origin,
          errorCallbackURL: window.location.origin,
          newUserCallbackURL: window.location.origin,
        }),
      });

      const payload = (await response.json()) as { url?: string };

      if (!payload.url) {
        throw new Error('Google ログイン URL を取得できませんでした。');
      }

      window.location.href = payload.url;
    } catch (nextError) {
      setBusy(false);
      setError(toErrorMessage(nextError, 'Google ログインに失敗しました。'));
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    setError(null);

    try {
      await fetch(`${api.apiBase}/api/auth/sign-out`, {
        method: 'POST',
        credentials: 'include',
      });
      setSession(null);
      setIngredients([]);
      setMeals([]);
      setPreferences(defaultPreferences());
      setLlmSettings(defaultLlmRecord());
      setLlmDraft(defaultLlmSettings());
      setLlmCatalog(null);
      setSuggestion(null);
    } catch (nextError) {
      setError(toErrorMessage(nextError, 'ログアウトに失敗しました。'));
    } finally {
      setBusy(false);
    }
  };

  const refreshAfterMutation = async () => {
    await loadDashboard();
    setEditingIngredientId(null);
    setEditingMealId(null);
    setIngredientForm(defaultIngredientForm());
    setMealForm(defaultMealForm());
  };

  const handleIngredientSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      if (editingIngredientId) {
        await api.updateIngredient(editingIngredientId, ingredientForm);
      } else {
        await api.createIngredient(ingredientForm);
      }

      await refreshAfterMutation();
    } catch (nextError) {
      setError(toErrorMessage(nextError, '食材の保存に失敗しました。'));
    } finally {
      setBusy(false);
    }
  };

  const handleMealSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      if (editingMealId) {
        await api.updateMeal(editingMealId, mealForm);
      } else {
        await api.createMeal(mealForm);
      }

      await refreshAfterMutation();
    } catch (nextError) {
      setError(toErrorMessage(nextError, '食事記録の保存に失敗しました。'));
    } finally {
      setBusy(false);
    }
  };

  const handlePreferencesSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const nextPreferences: UserPreferencesInput = {
        allergies: fromTagString(preferenceDraft.allergies),
        dislikes: fromTagString(preferenceDraft.dislikes),
        note: asNullableText(preferenceDraft.note),
      };

      await api.savePreferences(nextPreferences);
      setPreferences(nextPreferences);
      await loadDashboard();
    } catch (nextError) {
      setError(toErrorMessage(nextError, '個人条件の保存に失敗しました。'));
    } finally {
      setBusy(false);
    }
  };

  const handleLlmProviderChange = async (provider: LlmProvider) => {
    setLlmDraft((current) => ({
      ...current,
      provider,
    }));
    setLlmCatalogLoading(true);

    const nextCatalog = await fetchLlmCatalog(provider);
    setLlmCatalog(nextCatalog);
    setLlmDraft((current) => ({
      provider,
      modelId: nextCatalog.models.some((model) => model.id === current.modelId)
        ? current.modelId
        : nextCatalog.models[0]?.id ?? '',
    }));
    setLlmCatalogLoading(false);
  };

  const handleLlmSettingsSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const saved = await api.saveLlmSettings(llmDraft);
      setLlmSettings(saved);
      setLlmDraft({
        provider: saved.provider,
        modelId: saved.modelId,
      });
      setLlmCatalog(await fetchLlmCatalog(saved.provider));
    } catch (nextError) {
      setError(toErrorMessage(nextError, 'AI 設定の保存に失敗しました。'));
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateSuggestion = async () => {
    setBusy(true);
    setError(null);

    try {
      const nextSuggestion = await api.generateTodaySuggestion();
      setSuggestion(nextSuggestion);
      await loadDashboard();
    } catch (nextError) {
      setError(toErrorMessage(nextError, '提案生成に失敗しました。'));
    } finally {
      setBusy(false);
    }
  };

  const startIngredientEdit = (ingredient: IngredientRecord) => {
    setEditingIngredientId(ingredient.id);
    setIngredientForm({
      ...ingredient,
      note: ingredient.note ?? null,
    });
  };

  const startMealEdit = (meal: MealLogRecord) => {
    setEditingMealId(meal.id);
    setMealForm({
      ...meal,
      note: meal.note ?? null,
    });
  };

  const deleteIngredient = async (id: string) => {
    setBusy(true);
    setError(null);

    try {
      await api.deleteIngredient(id);
      await loadDashboard();
    } catch (nextError) {
      setError(toErrorMessage(nextError, '食材の削除に失敗しました。'));
    } finally {
      setBusy(false);
    }
  };

  const deleteMeal = async (id: string) => {
    setBusy(true);
    setError(null);

    try {
      await api.deleteMeal(id);
      await loadDashboard();
    } catch (nextError) {
      setError(toErrorMessage(nextError, '食事記録の削除に失敗しました。'));
    } finally {
      setBusy(false);
    }
  };

  const expiringSoon = ingredients.filter(
    (ingredient) =>
      ingredient.expiresOn &&
      ingredient.expiresOn <= new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString().slice(0, 10),
  );

  const latestMeals = meals.slice(0, 5);

  const llmModelOptions = useMemo(() => {
    if (!llmCatalog) {
      return [];
    }

    if (
      !llmDraft.modelId ||
      llmCatalog.models.some((model) => model.id === llmDraft.modelId)
    ) {
      return llmCatalog.models;
    }

    return [fallbackModelOption(llmDraft.modelId), ...llmCatalog.models];
  }, [llmCatalog, llmDraft.modelId]);

  const selectedLlmModel = llmModelOptions.find((model) => model.id === llmDraft.modelId) ?? null;
  const selectedModelAvailable =
    llmCatalog?.models.some((model) => model.id === llmDraft.modelId) ?? false;

  if (booting) {
    return (
      <main className="app-shell loading-state">
        <div className="loading-panel">
          <p>アプリを初期化しています...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="backdrop backdrop-left" />
      <div className="backdrop backdrop-right" />

      <section className="hero-panel">
        <div>
          <p className="eyebrow">Mastra + Better Auth + PostgreSQL</p>
          <h1>Aiva</h1>
          <p className="hero-copy">
            登録済みの食材、最近の食事記録、苦手・アレルギー条件をまとめて読み取り、
            その日の献立を日本語で提案する生活支援アプリです。
          </p>
        </div>

        <div className="hero-actions">
          {session ? (
            <>
              <div className="account-badge">
                <span>{session.user.name}</span>
                <small>{session.user.email}</small>
              </div>
              <button type="button" className="primary-button" onClick={handleSignOut} disabled={busy}>
                ログアウト
              </button>
            </>
          ) : (
            <button type="button" className="primary-button" onClick={handleGoogleSignIn} disabled={busy}>
              Google でログイン
            </button>
          )}
        </div>
      </section>

      {error ? <p className="error-banner">{error}</p> : null}

      {!session ? (
        <section className="landing-grid">
          <article className="feature-card">
            <h2>1. 食材を記録</h2>
            <p>数量、期限、栄養情報まで登録して在庫の鮮度を把握します。</p>
          </article>
          <article className="feature-card">
            <h2>2. 食事を記録</h2>
            <p>朝昼夕のメニューと満足度を残して、最近の傾向を学習材料にします。</p>
          </article>
          <article className="feature-card">
            <h2>3. 今日の提案</h2>
            <p>Mastra がルールと AI を組み合わせて、在庫優先の献立を返します。</p>
          </article>
        </section>
      ) : (
        <>
          <section className="summary-grid">
            <article className="metric-card">
              <span>登録食材</span>
              <strong>{ingredients.length}</strong>
            </article>
            <article className="metric-card">
              <span>期限が近い食材</span>
              <strong>{expiringSoon.length}</strong>
            </article>
            <article className="metric-card">
              <span>直近の食事記録</span>
              <strong>{meals.length}</strong>
            </article>
            <article className="metric-card">
              <span>AI設定</span>
              <strong>{providerLabels[llmSettings.provider]}</strong>
            </article>
          </section>

          <section className="dashboard-grid">
            <article className="panel spotlight-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Today&apos;s Suggestion</p>
                  <h2>今日の食事サジェスト</h2>
                </div>
                <button type="button" className="primary-button" onClick={handleGenerateSuggestion} disabled={busy}>
                  {suggestion ? '再生成する' : '生成する'}
                </button>
              </div>

              {suggestion ? (
                <div className="suggestion-stack">
                  <div className="suggestion-summary">
                    <h3>提案メモ</h3>
                    <p>{suggestion.note}</p>
                    <p className="muted-copy">{suggestion.recentPattern}</p>
                    <p className="muted-copy">
                      使用モデル: {formatLlmSelection(suggestion.llm ?? llmSettings)}
                    </p>
                  </div>

                  <div className="priority-list">
                    {suggestion.priorities.map((priority) => (
                      <div key={priority.ingredientId} className="priority-item">
                        <div>
                          <strong>{priority.name}</strong>
                          <p>{priority.reason}</p>
                        </div>
                        <span>{priority.urgencyScore}</span>
                      </div>
                    ))}
                  </div>

                  <div className="meal-list">
                    {suggestion.meals.map((meal) => (
                      <article key={meal.title} className="meal-card">
                        <h3>{meal.title}</h3>
                        <p>{meal.summary}</p>
                        <ul>
                          {meal.whyItFits.map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                        {meal.cautions.length ? (
                          <div className="caution-box">
                            {meal.cautions.map((caution) => (
                              <p key={caution}>{caution}</p>
                            ))}
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="empty-copy">
                  まだ今日の提案は生成されていません。食材と食事記録を登録した上で提案を作成してください。
                </p>
              )}
            </article>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Inventory</p>
                  <h2>食材管理</h2>
                </div>
              </div>

              <form className="data-form" onSubmit={handleIngredientSubmit}>
                <div className="form-grid">
                  <label>
                    <span>食材名</span>
                    <input
                      value={ingredientForm.name}
                      onChange={(event) =>
                        setIngredientForm((current) => ({ ...current, name: event.target.value }))
                      }
                      placeholder="例: 鶏むね肉"
                      required
                    />
                  </label>
                  <label>
                    <span>カテゴリ</span>
                    <select
                      value={ingredientForm.category}
                      onChange={(event) =>
                        setIngredientForm((current) => ({
                          ...current,
                          category: event.target.value as IngredientInput['category'],
                        }))
                      }
                    >
                      {ingredientCategories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>数量</span>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={ingredientForm.quantity}
                      onChange={(event) =>
                        setIngredientForm((current) => ({
                          ...current,
                          quantity: Number(event.target.value),
                        }))
                      }
                      required
                    />
                  </label>
                  <label>
                    <span>単位</span>
                    <select
                      value={ingredientForm.unit}
                      onChange={(event) =>
                        setIngredientForm((current) => ({
                          ...current,
                          unit: event.target.value as IngredientInput['unit'],
                        }))
                      }
                    >
                      {quantityUnits.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>期限</span>
                    <input
                      type="date"
                      value={ingredientForm.expiresOn ?? ''}
                      onChange={(event) =>
                        setIngredientForm((current) => ({
                          ...current,
                          expiresOn: asNullableText(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>カロリー</span>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={ingredientForm.calories ?? ''}
                      onChange={(event) =>
                        setIngredientForm((current) => ({
                          ...current,
                          calories: asNullableNumber(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>たんぱく質</span>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={ingredientForm.protein ?? ''}
                      onChange={(event) =>
                        setIngredientForm((current) => ({
                          ...current,
                          protein: asNullableNumber(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>脂質</span>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={ingredientForm.fat ?? ''}
                      onChange={(event) =>
                        setIngredientForm((current) => ({
                          ...current,
                          fat: asNullableNumber(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>炭水化物</span>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={ingredientForm.carbs ?? ''}
                      onChange={(event) =>
                        setIngredientForm((current) => ({
                          ...current,
                          carbs: asNullableNumber(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <label className="full-width">
                    <span>メモ</span>
                    <textarea
                      value={ingredientForm.note ?? ''}
                      onChange={(event) =>
                        setIngredientForm((current) => ({
                          ...current,
                          note: asNullableText(event.target.value),
                        }))
                      }
                      rows={2}
                    />
                  </label>
                </div>

                <div className="form-actions">
                  <button type="submit" className="primary-button" disabled={busy}>
                    {editingIngredientId ? '食材を更新' : '食材を追加'}
                  </button>
                  {editingIngredientId ? (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setEditingIngredientId(null);
                        setIngredientForm(defaultIngredientForm());
                      }}
                    >
                      キャンセル
                    </button>
                  ) : null}
                </div>
              </form>

              <div className="list-stack">
                {ingredients.map((ingredient) => (
                  <div key={ingredient.id} className="list-row">
                    <div>
                      <strong>{ingredient.name}</strong>
                      <p>
                        {ingredient.quantity}
                        {ingredient.unit} / {ingredient.category}
                        {ingredient.expiresOn ? ` / 期限 ${ingredient.expiresOn}` : ' / 期限未登録'}
                      </p>
                    </div>
                    <div className="row-actions">
                      <button type="button" className="secondary-button" onClick={() => startIngredientEdit(ingredient)}>
                        編集
                      </button>
                      <button type="button" className="ghost-button" onClick={() => deleteIngredient(ingredient.id)}>
                        削除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Meal History</p>
                  <h2>食事記録</h2>
                </div>
              </div>

              <form className="data-form" onSubmit={handleMealSubmit}>
                <div className="form-grid">
                  <label>
                    <span>日付</span>
                    <input
                      type="date"
                      value={mealForm.consumedOn}
                      onChange={(event) =>
                        setMealForm((current) => ({
                          ...current,
                          consumedOn: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>食事区分</span>
                    <select
                      value={mealForm.mealType}
                      onChange={(event) =>
                        setMealForm((current) => ({
                          ...current,
                          mealType: event.target.value as MealLogInput['mealType'],
                        }))
                      }
                    >
                      {mealTypes.map((mealType) => (
                        <option key={mealType} value={mealType}>
                          {mealType}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="full-width">
                    <span>メニュー名</span>
                    <input
                      value={mealForm.menuName}
                      onChange={(event) =>
                        setMealForm((current) => ({
                          ...current,
                          menuName: event.target.value,
                        }))
                      }
                      placeholder="例: 鶏むね肉のソテー"
                      required
                    />
                  </label>
                  <label>
                    <span>満足度</span>
                    <input
                      type="number"
                      min="1"
                      max="5"
                      value={mealForm.satisfaction ?? ''}
                      onChange={(event) =>
                        setMealForm((current) => ({
                          ...current,
                          satisfaction: asNullableNumber(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <label className="full-width">
                    <span>メモ</span>
                    <textarea
                      value={mealForm.note ?? ''}
                      onChange={(event) =>
                        setMealForm((current) => ({
                          ...current,
                          note: asNullableText(event.target.value),
                        }))
                      }
                      rows={2}
                    />
                  </label>
                </div>

                <div className="form-actions">
                  <button type="submit" className="primary-button" disabled={busy}>
                    {editingMealId ? '記録を更新' : '記録を追加'}
                  </button>
                  {editingMealId ? (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setEditingMealId(null);
                        setMealForm(defaultMealForm());
                      }}
                    >
                      キャンセル
                    </button>
                  ) : null}
                </div>
              </form>

              <div className="list-stack">
                {latestMeals.map((meal) => (
                  <div key={meal.id} className="list-row">
                    <div>
                      <strong>{meal.menuName}</strong>
                      <p>
                        {meal.consumedOn} / {meal.mealType}
                        {meal.satisfaction ? ` / 満足度 ${meal.satisfaction}` : ''}
                      </p>
                    </div>
                    <div className="row-actions">
                      <button type="button" className="secondary-button" onClick={() => startMealEdit(meal)}>
                        編集
                      </button>
                      <button type="button" className="ghost-button" onClick={() => deleteMeal(meal.id)}>
                        削除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Personal Constraints</p>
                  <h2>個人条件</h2>
                </div>
              </div>

              <form className="data-form" onSubmit={handlePreferencesSubmit}>
                <div className="form-grid">
                  <label className="full-width">
                    <span>アレルギー</span>
                    <input
                      value={preferenceDraft.allergies}
                      onChange={(event) =>
                        setPreferenceDraft((current) => ({
                          ...current,
                          allergies: event.target.value,
                        }))
                      }
                      placeholder="例: えび, かに"
                    />
                  </label>
                  <label className="full-width">
                    <span>苦手食材</span>
                    <input
                      value={preferenceDraft.dislikes}
                      onChange={(event) =>
                        setPreferenceDraft((current) => ({
                          ...current,
                          dislikes: event.target.value,
                        }))
                      }
                      placeholder="例: セロリ, パクチー"
                    />
                  </label>
                  <label className="full-width">
                    <span>補足メモ</span>
                    <textarea
                      value={preferenceDraft.note}
                      onChange={(event) =>
                        setPreferenceDraft((current) => ({
                          ...current,
                          note: event.target.value,
                        }))
                      }
                      rows={3}
                      placeholder="例: 平日は20分以内の調理が望ましい"
                    />
                  </label>
                </div>
                <div className="form-actions">
                  <button type="submit" className="primary-button" disabled={busy}>
                    条件を保存
                  </button>
                </div>
              </form>

              <div className="preference-preview">
                <p>
                  <strong>アレルギー:</strong>{' '}
                  {preferences.allergies.length ? preferences.allergies.join('、') : '未設定'}
                </p>
                <p>
                  <strong>苦手食材:</strong>{' '}
                  {preferences.dislikes.length ? preferences.dislikes.join('、') : '未設定'}
                </p>
              </div>
            </article>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">AI Settings</p>
                  <h2>AI設定</h2>
                </div>
              </div>

              <form className="data-form" onSubmit={handleLlmSettingsSubmit}>
                <div className="form-grid">
                  <label>
                    <span>Provider</span>
                    <select
                      value={llmDraft.provider}
                      onChange={(event) => {
                        void handleLlmProviderChange(event.target.value as LlmProvider);
                      }}
                    >
                      {(Object.keys(providerLabels) as LlmProvider[]).map((provider) => (
                        <option key={provider} value={provider}>
                          {providerLabels[provider]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="full-width">
                    <span>Model</span>
                    <select
                      value={llmDraft.modelId}
                      onChange={(event) =>
                        setLlmDraft((current) => ({
                          ...current,
                          modelId: event.target.value,
                        }))
                      }
                      disabled={llmCatalogLoading || llmModelOptions.length === 0}
                    >
                      {llmModelOptions.length ? (
                        llmModelOptions.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.name}
                          </option>
                        ))
                      ) : (
                        <option value="">
                          {llmCatalogLoading ? 'モデル一覧を読み込んでいます...' : '利用可能なモデルがありません'}
                        </option>
                      )}
                    </select>
                  </label>
                  <div className="full-width ai-status-box">
                    <div className="status-row">
                      <span className={`status-pill ${llmCatalog?.available ? 'available' : 'unavailable'}`}>
                        {llmCatalog?.available ? '利用可能' : '要設定'}
                      </span>
                      <span className="status-pill neutral">
                        保存済み: {formatLlmSelection(llmSettings)}
                      </span>
                    </div>
                    <p className="muted-copy">
                      {llmCatalogLoading
                        ? '選択中 provider のモデル一覧を取得しています。'
                        : llmCatalog?.reason ?? 'サーバー側の API キーで利用可能なモデル候補を表示しています。'}
                    </p>
                    {llmCatalog?.available && !selectedModelAvailable ? (
                      <p className="muted-copy">
                        現在の保存値は最新の catalog に含まれていません。利用可能な model に切り替えて保存してください。
                      </p>
                    ) : null}
                    {selectedLlmModel ? (
                      <div className="model-meta">
                        <strong>{selectedLlmModel.name}</strong>
                        <p>{selectedLlmModel.description ?? '説明はありません。'}</p>
                        <p className="muted-copy">
                          {selectedLlmModel.contextLength
                            ? `コンテキスト長: ${selectedLlmModel.contextLength.toLocaleString()}`
                            : 'コンテキスト長は未公開です。'}
                          {' / '}
                          {selectedLlmModel.supportsStructuredOutput
                            ? 'structured output 対応'
                            : 'structured output は JSON 指示で補完'}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="form-actions">
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={
                      busy ||
                      llmCatalogLoading ||
                      !llmCatalog?.available ||
                      !selectedModelAvailable ||
                      llmDraft.modelId.trim() === ''
                    }
                  >
                    AI設定を保存
                  </button>
                </div>
              </form>

              <div className="preference-preview">
                <p>
                  <strong>現在の provider:</strong> {providerLabels[llmSettings.provider]}
                </p>
                <p>
                  <strong>現在の model:</strong> {llmSettings.modelId}
                </p>
                <p>
                  <strong>最終更新:</strong>{' '}
                  {llmSettings.updatedAt
                    ? new Date(llmSettings.updatedAt).toLocaleString('ja-JP')
                    : '未保存'}
                </p>
              </div>
            </article>
          </section>
        </>
      )}
    </main>
  );
};

export default App;
