import type {
  DailySuggestionResponse,
  IngredientInput,
  IngredientRecord,
  LlmCatalogResponse,
  LlmCredentialStatus,
  LlmModelOption,
  LlmProvider,
  MealLogInput,
  MealLogRecord,
  UserLlmSettingsInput,
  UserLlmSettingsRecord,
  UserLlmSettingsUpdateInput,
  UserPreferencesInput,
} from '@aiva/shared';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from 'react';
import './App.css';
import {
  type DashboardView,
  dashboardRoutePaths,
  dashboardViewMeta,
  resolveDashboardView,
} from './dashboard-routes';
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

const quantityUnits = [
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

const mealTypes = ['朝食', '昼食', '夕食', '間食'] as const;

const providerLabels: Record<LlmProvider, string> = {
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
};

const themeStorageKey = 'aiva-theme-mode';

type ThemeMode = 'light' | 'dark';

type ModalShellProps = {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
};

type TagInputFieldProps = {
  label: string;
  values: string[];
  inputValue: string;
  placeholder: string;
  onInputChange: (value: string) => void;
  onCommit: (value: string) => void;
  onRemove: (value: string) => void;
};

const ModalShell = ({
  open,
  title,
  description,
  onClose,
  children,
}: ModalShellProps) => {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-layer">
      <button
        type="button"
        className="modal-backdrop"
        onClick={onClose}
        aria-label={`${title} を閉じる`}
      />
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">{title}</p>
            <h2>{description}</h2>
          </div>
          <button
            type="button"
            className="secondary-button modal-close-button"
            onClick={onClose}
          >
            閉じる
          </button>
        </div>
        {children}
      </section>
    </div>
  );
};

const TagInputField = ({
  label,
  values,
  inputValue,
  placeholder,
  onInputChange,
  onCommit,
  onRemove,
}: TagInputFieldProps) => {
  const commitInput = () => {
    onCommit(inputValue);
  };

  return (
    <label className="full-width tag-input-field">
      <span>{label}</span>
      <div className="tag-input-shell">
        {values.length ? (
          <div className="tag-list">
            {values.map((value) => (
              <span key={value} className="tag-chip">
                <strong>{value}</strong>
                <button
                  type="button"
                  className="tag-chip-remove"
                  onClick={() => onRemove(value)}
                  aria-label={`${value} を削除`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="tag-empty">まだ追加されていません。</p>
        )}
        <input
          value={inputValue}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' ||
              event.key === ',' ||
              event.key === '、'
            ) {
              event.preventDefault();
              commitInput();
            }
          }}
          onBlur={commitInput}
          placeholder={placeholder}
        />
      </div>
      <p className="tag-helper">Enter またはカンマで追加できます。</p>
    </label>
  );
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
  notes: [],
});

const defaultLlmSettings = (): UserLlmSettingsInput => ({
  provider: 'openai',
  modelId: 'gpt-5-mini',
});

const defaultCredentialStatus = (): Record<
  LlmProvider,
  LlmCredentialStatus
> => ({
  openai: {
    configured: false,
    source: 'none',
    keyHint: null,
  },
  openrouter: {
    configured: false,
    source: 'none',
    keyHint: null,
  },
});

const defaultLlmRecord = (): UserLlmSettingsRecord => ({
  ...defaultLlmSettings(),
  updatedAt: null,
  credentialStatus: defaultCredentialStatus(),
});

const asNullableNumber = (value: string) => {
  return value === '' ? null : Number(value);
};

const asNullableText = (value: string) => {
  return value.trim() === '' ? null : value.trim();
};

const fromTagString = (value: string) =>
  value
    .split(/[,\n、]/)
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

const formatCredentialStatusLabel = (status: LlmCredentialStatus) => {
  if (status.source === 'user') {
    return `保存済みキー ${status.keyHint ?? ''}`.trim();
  }

  if (status.source === 'server') {
    return 'サーバー設定を利用';
  }

  return 'APIキー未設定';
};

const formatCredentialStatusNote = (status: LlmCredentialStatus) => {
  if (status.source === 'user') {
    return 'この provider にはアプリ内で保存した API キーがあります。';
  }

  if (status.source === 'server') {
    return 'この provider はサーバー側の API キーで利用できます。';
  }

  return 'API キーを入力してモデル一覧を取得してください。';
};

const getInitialTheme = (): ThemeMode => {
  if (typeof window === 'undefined') {
    return 'dark';
  }

  const storage =
    'localStorage' in window &&
    typeof window.localStorage?.getItem === 'function' &&
    typeof window.localStorage?.setItem === 'function'
      ? window.localStorage
      : null;
  const storedTheme = storage?.getItem(themeStorageKey);

  if (storedTheme === 'light' || storedTheme === 'dark') {
    return storedTheme;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
};

const App = () => {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<IngredientRecord[]>([]);
  const [meals, setMeals] = useState<MealLogRecord[]>([]);
  const [preferences, setPreferences] = useState<UserPreferencesInput>(
    defaultPreferences(),
  );
  const [llmSettings, setLlmSettings] = useState<UserLlmSettingsRecord>(
    defaultLlmRecord(),
  );
  const [llmDraft, setLlmDraft] = useState<UserLlmSettingsInput>(
    defaultLlmSettings(),
  );
  const [llmCatalog, setLlmCatalog] = useState<LlmCatalogResponse | null>(null);
  const [llmCatalogLoading, setLlmCatalogLoading] = useState(false);
  const [llmApiKeyInput, setLlmApiKeyInput] = useState('');
  const [clearStoredLlmApiKey, setClearStoredLlmApiKey] = useState(false);
  const [suggestion, setSuggestion] = useState<DailySuggestionResponse | null>(
    null,
  );
  const [ingredientForm, setIngredientForm] = useState<IngredientInput>(
    defaultIngredientForm(),
  );
  const [mealForm, setMealForm] = useState<MealLogInput>(defaultMealForm());
  const [preferenceDraft, setPreferenceDraft] = useState({
    allergies: [] as string[],
    dislikes: [] as string[],
    notes: [] as string[],
    allergyInput: '',
    dislikeInput: '',
    noteInput: '',
  });
  const [editingIngredientId, setEditingIngredientId] = useState<string | null>(
    null,
  );
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ingredientModalOpen, setIngredientModalOpen] = useState(false);
  const [mealModalOpen, setMealModalOpen] = useState(false);
  const [suggestionModalOpen, setSuggestionModalOpen] = useState(false);
  const [suggestionModalState, setSuggestionModalState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const [suggestionModalMessage, setSuggestionModalMessage] = useState<
    string | null
  >(null);
  const [suggestionModalSuggestion, setSuggestionModalSuggestion] =
    useState<DailySuggestionResponse | null>(null);

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
      setLlmApiKeyInput('');
      setClearStoredLlmApiKey(false);
      setPreferenceDraft({
        allergies: nextPreferences.allergies,
        dislikes: nextPreferences.dislikes,
        notes: nextPreferences.notes,
        allergyInput: '',
        dislikeInput: '',
        noteInput: '',
      });
      setSuggestion(nextSuggestion);
    } catch (nextError) {
      setError(toErrorMessage(nextError, 'データの取得に失敗しました。'));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;

    if (
      'localStorage' in window &&
      typeof window.localStorage?.setItem === 'function'
    ) {
      window.localStorage.setItem(themeStorageKey, theme);
    }
  }, [theme]);

  const loadSessionEvent = useEffectEvent(loadSession);
  const loadDashboardEvent = useEffectEvent(loadDashboard);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      const nextSession = await loadSessionEvent();
      if (!active) {
        return;
      }

      if (nextSession) {
        await loadDashboardEvent();
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

  useEffect(() => {
    if (pathname) {
      setSidebarOpen(false);
    }
  }, [pathname]);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    if (session && sidebarOpen && window.innerWidth <= 1024) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }

    document.body.style.overflow = previousOverflow;

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [session, sidebarOpen]);

  useEffect(() => {
    if (session) {
      return;
    }

    setIngredientModalOpen(false);
    setMealModalOpen(false);

    if (pathname !== dashboardRoutePaths.overview) {
      void navigate({ to: dashboardRoutePaths.overview });
    }
  }, [navigate, pathname, session]);

  const toggleTheme = () => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  };

  const navigateTo = (view: DashboardView) => {
    setSidebarOpen(false);
    void navigate({ to: dashboardRoutePaths[view] });
  };

  const closeIngredientModal = () => {
    setIngredientModalOpen(false);
    setEditingIngredientId(null);
    setIngredientForm(defaultIngredientForm());
  };

  const closeMealModal = () => {
    setMealModalOpen(false);
    setEditingMealId(null);
    setMealForm(defaultMealForm());
  };

  const closeSuggestionModal = () => {
    setSuggestionModalOpen(false);
    setSuggestionModalState('idle');
    setSuggestionModalMessage(null);
    setSuggestionModalSuggestion(null);
  };

  const openIngredientComposer = () => {
    setEditingIngredientId(null);
    setIngredientForm(defaultIngredientForm());
    setIngredientModalOpen(true);
    navigateTo('ingredients');
  };

  const openMealComposer = () => {
    setEditingMealId(null);
    setMealForm(defaultMealForm());
    setMealModalOpen(true);
    navigateTo('meals');
  };

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

      if (!response.ok) {
        const rawBody = await response.text();
        let message = rawBody || 'Google ログインに失敗しました。';

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
      setLlmApiKeyInput('');
      setClearStoredLlmApiKey(false);
      setSuggestion(null);
      closeIngredientModal();
      closeMealModal();
      closeSuggestionModal();
    } catch (nextError) {
      setError(toErrorMessage(nextError, 'ログアウトに失敗しました。'));
    } finally {
      setBusy(false);
    }
  };

  const refreshAfterMutation = async () => {
    await loadDashboard();
    closeIngredientModal();
    closeMealModal();
  };

  const handleIngredientSubmit = async (event: FormEvent<HTMLFormElement>) => {
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

  const handleMealSubmit = async (event: FormEvent<HTMLFormElement>) => {
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

  const handlePreferencesSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const nextPreferences: UserPreferencesInput = {
        allergies: preferenceDraft.allergies,
        dislikes: preferenceDraft.dislikes,
        notes: preferenceDraft.notes,
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

  const addUniqueTags = (currentValues: string[], rawValue: string) => {
    const tokens = fromTagString(rawValue);

    if (!tokens.length) {
      return currentValues;
    }

    return Array.from(new Set([...currentValues, ...tokens]));
  };

  const commitAllergyInput = (rawValue: string) => {
    setPreferenceDraft((current) => ({
      ...current,
      allergies: addUniqueTags(current.allergies, rawValue),
      allergyInput: '',
    }));
  };

  const commitDislikeInput = (rawValue: string) => {
    setPreferenceDraft((current) => ({
      ...current,
      dislikes: addUniqueTags(current.dislikes, rawValue),
      dislikeInput: '',
    }));
  };

  const commitNoteInput = (rawValue: string) => {
    setPreferenceDraft((current) => ({
      ...current,
      notes: addUniqueTags(current.notes, rawValue),
      noteInput: '',
    }));
  };

  const removeAllergyTag = (value: string) => {
    setPreferenceDraft((current) => ({
      ...current,
      allergies: current.allergies.filter((item) => item !== value),
    }));
  };

  const removeDislikeTag = (value: string) => {
    setPreferenceDraft((current) => ({
      ...current,
      dislikes: current.dislikes.filter((item) => item !== value),
    }));
  };

  const removeNoteTag = (value: string) => {
    setPreferenceDraft((current) => ({
      ...current,
      notes: current.notes.filter((item) => item !== value),
    }));
  };

  const handleLlmProviderChange = async (provider: LlmProvider) => {
    setLlmDraft((current) => ({
      ...current,
      provider,
    }));
    setLlmApiKeyInput('');
    setClearStoredLlmApiKey(false);
    setLlmCatalogLoading(true);

    const nextCatalog = await fetchLlmCatalog(provider);
    setLlmCatalog(nextCatalog);
    setLlmDraft((current) => ({
      provider,
      modelId: nextCatalog.models.some((model) => model.id === current.modelId)
        ? current.modelId
        : (nextCatalog.models[0]?.id ?? ''),
    }));
    setLlmCatalogLoading(false);
  };

  const handleLlmCatalogPreview = async () => {
    setLlmCatalogLoading(true);
    setError(null);

    try {
      const nextCatalog =
        llmApiKeyInput.trim() || clearStoredLlmApiKey
          ? await api.previewLlmModels({
              provider: llmDraft.provider,
              apiKey: asNullableText(llmApiKeyInput),
            })
          : await fetchLlmCatalog(llmDraft.provider);

      setLlmCatalog(nextCatalog);
      setLlmDraft((current) => ({
        provider: llmDraft.provider,
        modelId: nextCatalog.models.some(
          (model) => model.id === current.modelId,
        )
          ? current.modelId
          : (nextCatalog.models[0]?.id ?? ''),
      }));
    } catch (nextError) {
      setError(
        toErrorMessage(
          nextError,
          '入力中の API キーでモデル一覧の取得に失敗しました。',
        ),
      );
    } finally {
      setLlmCatalogLoading(false);
    }
  };

  const handleLlmSettingsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const payload: UserLlmSettingsUpdateInput = {
        provider: llmDraft.provider,
        modelId: llmDraft.modelId,
        apiKey: asNullableText(llmApiKeyInput),
        clearStoredApiKey: clearStoredLlmApiKey,
      };
      const saved = await api.saveLlmSettings(payload);
      setLlmSettings(saved);
      setLlmDraft({
        provider: saved.provider,
        modelId: saved.modelId,
      });
      setLlmApiKeyInput('');
      setClearStoredLlmApiKey(false);
      setLlmCatalog(await fetchLlmCatalog(saved.provider));
    } catch (nextError) {
      setError(toErrorMessage(nextError, 'AI 設定の保存に失敗しました。'));
    } finally {
      setBusy(false);
    }
  };

  const getOrCreateTodaySuggestion = async () => {
    const existingSuggestion = await api.getTodaySuggestion();

    if (existingSuggestion) {
      return {
        suggestion: existingSuggestion,
        source: 'existing' as const,
      };
    }

    return {
      suggestion: await api.generateTodaySuggestion(),
      source: 'generated' as const,
    };
  };

  const handleGenerateSuggestion = async () => {
    setBusy(true);
    setError(null);

    try {
      const { suggestion: nextSuggestion } = await getOrCreateTodaySuggestion();
      setSuggestion(nextSuggestion);
      navigateTo('suggestion');
    } catch (nextError) {
      setError(toErrorMessage(nextError, '提案生成に失敗しました。'));
    } finally {
      setBusy(false);
    }
  };

  const handleSuggestionDockClick = async () => {
    setSuggestionModalOpen(true);
    setSuggestionModalState('loading');
    setSuggestionModalMessage(null);
    setSuggestionModalSuggestion(null);
    setBusy(true);
    setError(null);

    try {
      const { suggestion: nextSuggestion, source } =
        await getOrCreateTodaySuggestion();

      setSuggestion(nextSuggestion);
      setSuggestionModalSuggestion(nextSuggestion);
      setSuggestionModalState('ready');
      setSuggestionModalMessage(
        source === 'existing'
          ? '本日の提案はすでに生成・保存されています。保存済みの内容を表示しています。'
          : '今日の提案を生成し、自動で保存しました。',
      );
    } catch (nextError) {
      const message = toErrorMessage(nextError, '提案生成に失敗しました。');
      setError(message);
      setSuggestionModalState('error');
      setSuggestionModalMessage(message);
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
    setIngredientModalOpen(true);
    navigateTo('ingredients');
  };

  const startMealEdit = (meal: MealLogRecord) => {
    setEditingMealId(meal.id);
    setMealForm({
      ...meal,
      note: meal.note ?? null,
    });
    setMealModalOpen(true);
    navigateTo('meals');
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
      ingredient.expiresOn <=
        new Date(Date.now() + 1000 * 60 * 60 * 24 * 3)
          .toISOString()
          .slice(0, 10),
  );

  const latestMeals = meals.slice(0, 5);
  const recentIngredients = ingredients.slice(0, 8);
  const ratedMeals = meals.filter(
    (meal) => typeof meal.satisfaction === 'number',
  );
  const averageSatisfaction = ratedMeals.length
    ? (
        ratedMeals.reduce(
          (total, meal) => total + (meal.satisfaction ?? 0),
          0,
        ) / ratedMeals.length
      ).toFixed(1)
    : '未記録';
  const dominantMeal = mealTypes
    .map((mealType) => ({
      mealType,
      count: meals.filter((meal) => meal.mealType === mealType).length,
    }))
    .sort((left, right) => right.count - left.count)[0];

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

  const selectedLlmModel =
    llmModelOptions.find((model) => model.id === llmDraft.modelId) ?? null;
  const selectedModelAvailable =
    llmCatalog?.models.some((model) => model.id === llmDraft.modelId) ?? false;
  const selectedCredentialStatus =
    llmSettings.credentialStatus[llmDraft.provider];
  const canClearStoredApiKey = selectedCredentialStatus.source === 'user';
  const hasDraftApiKey = llmApiKeyInput.trim().length > 0;
  const activeView = resolveDashboardView(pathname);
  const activeViewMeta = dashboardViewMeta[activeView];
  const suggestionStatusLabel = suggestion ? '生成済み' : '未生成';
  const suggestionStatusDetail = suggestion
    ? `${suggestion.meals.length}案を保存`
    : 'まだ作成されていません';
  const suggestionPrimaryActionLabel = suggestion
    ? '保存済みを開く'
    : '生成する';

  const navigationItems: Array<{
    id: DashboardView;
    label: string;
    description: string;
    badge: string;
  }> = [
    {
      id: 'overview',
      label: 'Dashboard',
      description: '全体サマリー',
      badge: `${ingredients.length}`,
    },
    {
      id: 'suggestion',
      label: '今日の提案',
      description: suggestion ? '生成済み' : '未生成',
      badge: suggestion ? `${suggestion.meals.length}` : '0',
    },
    {
      id: 'ingredients',
      label: '食材',
      description: '在庫と期限',
      badge: `${expiringSoon.length}`,
    },
    {
      id: 'meals',
      label: '食事',
      description: '記録と満足度',
      badge: `${meals.length}`,
    },
    {
      id: 'settings',
      label: '設定',
      description: providerLabels[llmSettings.provider],
      badge: 'AI',
    },
  ];

  const renderSidebarContent = () => (
    <>
      <div className="sidebar-brand">
        <p className="eyebrow">Aiva Workspace</p>
        <h2>食事支援ダッシュボード</h2>
        <p className="muted-copy">
          ページ切替とモーダル操作で、在庫管理から提案確認までを整理しています。
        </p>
      </div>

      <div className="account-badge sidebar-account">
        <span>{session?.user.name}</span>
        <small>{session?.user.email}</small>
      </div>

      <nav className="sidebar-nav" aria-label="ダッシュボードナビゲーション">
        {navigationItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`sidebar-link ${activeView === item.id ? 'active' : ''}`}
            onClick={() => navigateTo(item.id)}
          >
            <span>{item.label}</span>
            <small>{item.description}</small>
            <strong>{item.badge}</strong>
          </button>
        ))}
      </nav>

      <div className="sidebar-card">
        <p className="eyebrow">Status</p>
        <p>
          <strong>今日の提案:</strong>{' '}
          {suggestion ? `${suggestion.meals.length} 案生成済み` : '未生成'}
        </p>
        <p>
          <strong>期限間近:</strong> {expiringSoon.length} 件
        </p>
        <p>
          <strong>LLM:</strong> {formatLlmSelection(llmSettings)}
        </p>
      </div>
    </>
  );

  const renderSuggestionPanel = (mode: 'overview' | 'full') => {
    const priorityItems =
      mode === 'overview'
        ? (suggestion?.priorities.slice(0, 3) ?? [])
        : (suggestion?.priorities ?? []);
    const mealItems =
      mode === 'overview'
        ? (suggestion?.meals.slice(0, 2) ?? [])
        : (suggestion?.meals ?? []);

    return (
      <article className="panel spotlight-panel section-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Today&apos;s Suggestion</p>
            <h2>今日の食事サジェスト</h2>
          </div>
          <button
            type="button"
            className="primary-button"
            onClick={handleGenerateSuggestion}
            disabled={busy}
          >
            {suggestionPrimaryActionLabel}
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
              {priorityItems.map((priority) => (
                <div key={priority.ingredientId} className="priority-item">
                  <div>
                    <strong>{priority.name}</strong>
                    <p>{priority.reason}</p>
                  </div>
                  <span>{priority.urgencyScore}</span>
                </div>
              ))}
              {mode === 'overview' &&
              suggestion.priorities.length > priorityItems.length ? (
                <p className="muted-copy">
                  優先候補をさらに{' '}
                  {suggestion.priorities.length - priorityItems.length}
                  件表示できます。
                </p>
              ) : null}
            </div>

            <div className="meal-list">
              {mealItems.map((meal) => (
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
              {mode === 'overview' &&
              suggestion.meals.length > mealItems.length ? (
                <button
                  type="button"
                  className="secondary-button inline-action"
                  onClick={() => navigateTo('suggestion')}
                >
                  提案の全文を見る
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="empty-copy">
            まだ今日の提案は生成されていません。食材と食事記録を登録した上で提案を作成してください。
          </p>
        )}
      </article>
    );
  };

  const renderOverview = () => {
    return (
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
            <span>平均満足度</span>
            <strong>{averageSatisfaction}</strong>
          </article>
          <article className="metric-card">
            <span>利用中 AI</span>
            <strong>{providerLabels[llmSettings.provider]}</strong>
          </article>
        </section>

        <section className="content-grid overview-grid">
          <div className="overview-suggestion">
            {renderSuggestionPanel('overview')}
          </div>

          <article className="panel section-panel overview-inventory">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Inventory Signals</p>
                <h2>在庫アラート</h2>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={openIngredientComposer}
              >
                食材を追加
              </button>
            </div>

            <div className="summary-strip compact-strip">
              <div className="summary-chip">
                <span>期限登録済み</span>
                <strong>
                  {
                    ingredients.filter((ingredient) => ingredient.expiresOn)
                      .length
                  }
                </strong>
              </div>
              <div className="summary-chip">
                <span>最優先</span>
                <strong>{expiringSoon[0]?.name ?? 'なし'}</strong>
              </div>
            </div>

            <div className="list-stack compact-list">
              {expiringSoon.length ? (
                expiringSoon.slice(0, 4).map((ingredient) => (
                  <div key={ingredient.id} className="list-row compact-row">
                    <div className="list-copy">
                      <strong>{ingredient.name}</strong>
                      <p>
                        期限 {ingredient.expiresOn} / {ingredient.quantity}
                        {ingredient.unit}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => startIngredientEdit(ingredient)}
                    >
                      編集
                    </button>
                  </div>
                ))
              ) : (
                <p className="empty-copy">
                  3 日以内に期限が来る食材はありません。
                </p>
              )}
            </div>
          </article>

          <article className="panel section-panel overview-actions">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Quick Actions</p>
                <h2>操作ショートカット</h2>
              </div>
            </div>

            <div className="quick-grid">
              <button
                type="button"
                className="secondary-button quick-action-button"
                onClick={() => navigateTo('suggestion')}
              >
                提案画面へ
              </button>
              <button
                type="button"
                className="secondary-button quick-action-button"
                onClick={() => navigateTo('settings')}
              >
                条件を調整
              </button>
              <button
                type="button"
                className="secondary-button quick-action-button"
                onClick={openIngredientComposer}
              >
                食材登録
              </button>
              <button
                type="button"
                className="secondary-button quick-action-button"
                onClick={openMealComposer}
              >
                食事記録
              </button>
            </div>

            <div className="preference-preview">
              <p>
                <strong>アレルギー:</strong>{' '}
                {preferences.allergies.length
                  ? preferences.allergies.join('、')
                  : '未設定'}
              </p>
              <p>
                <strong>苦手食材:</strong>{' '}
                {preferences.dislikes.length
                  ? preferences.dislikes.join('、')
                  : '未設定'}
              </p>
              <p>
                <strong>現在の model:</strong> {llmSettings.modelId}
              </p>
            </div>
          </article>

          <article className="panel section-panel overview-meals">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Recent Meals</p>
                <h2>最近の食事傾向</h2>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={openMealComposer}
              >
                記録を追加
              </button>
            </div>

            <div className="summary-strip compact-strip">
              <div className="summary-chip">
                <span>記録数</span>
                <strong>{meals.length}</strong>
              </div>
              <div className="summary-chip">
                <span>多い時間帯</span>
                <strong>
                  {dominantMeal?.count ? dominantMeal.mealType : '未記録'}
                </strong>
              </div>
            </div>

            <div className="list-stack compact-list">
              {latestMeals.length ? (
                latestMeals.map((meal) => (
                  <div key={meal.id} className="list-row compact-row">
                    <div className="list-copy">
                      <strong>{meal.menuName}</strong>
                      <p>
                        {meal.consumedOn} / {meal.mealType}
                        {meal.satisfaction
                          ? ` / 満足度 ${meal.satisfaction}`
                          : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => startMealEdit(meal)}
                    >
                      編集
                    </button>
                  </div>
                ))
              ) : (
                <p className="empty-copy">まだ食事記録はありません。</p>
              )}
            </div>
          </article>
        </section>
      </>
    );
  };

  const renderIngredientsView = () => {
    return (
      <section className="content-grid">
        <article className="panel section-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Inventory List</p>
              <h2>登録済みの食材</h2>
            </div>
            <div className="panel-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => navigateTo('suggestion')}
              >
                提案を見る
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={openIngredientComposer}
              >
                食材を追加
              </button>
            </div>
          </div>

          <div className="summary-strip">
            <div className="summary-chip">
              <span>総在庫数</span>
              <strong>{ingredients.length}</strong>
            </div>
            <div className="summary-chip">
              <span>期限間近</span>
              <strong>{expiringSoon.length}</strong>
            </div>
            <div className="summary-chip">
              <span>カテゴリ数</span>
              <strong>
                {new Set(ingredients.map((item) => item.category)).size}
              </strong>
            </div>
          </div>

          <div className="list-stack">
            {recentIngredients.length ? (
              ingredients.map((ingredient) => (
                <div key={ingredient.id} className="list-row list-row-detailed">
                  <div className="list-copy">
                    <strong>{ingredient.name}</strong>
                    <p>
                      {ingredient.quantity}
                      {ingredient.unit} / {ingredient.category}
                      {ingredient.expiresOn
                        ? ` / 期限 ${ingredient.expiresOn}`
                        : ' / 期限未登録'}
                    </p>
                    {ingredient.note ? (
                      <p className="muted-copy">{ingredient.note}</p>
                    ) : null}
                  </div>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => startIngredientEdit(ingredient)}
                    >
                      編集
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => deleteIngredient(ingredient.id)}
                    >
                      削除
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-copy">
                まだ食材は登録されていません。右上のボタンから追加してください。
              </p>
            )}
          </div>
        </article>

        <div className="side-stack">
          <article className="panel section-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Consume Next</p>
                <h2>優先消費候補</h2>
              </div>
            </div>

            <div className="list-stack compact-list">
              {expiringSoon.length ? (
                expiringSoon.map((ingredient) => (
                  <div key={ingredient.id} className="priority-item">
                    <div>
                      <strong>{ingredient.name}</strong>
                      <p>
                        {ingredient.category} / 期限 {ingredient.expiresOn}
                      </p>
                    </div>
                    <span>!</span>
                  </div>
                ))
              ) : (
                <p className="empty-copy">優先消費対象はありません。</p>
              )}
            </div>
          </article>

          <article className="panel section-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Notes</p>
                <h2>在庫メモ</h2>
              </div>
            </div>
            <div className="preference-preview">
              <p>
                <strong>期限登録あり:</strong>{' '}
                {
                  ingredients.filter((ingredient) => ingredient.expiresOn)
                    .length
                }{' '}
                件
              </p>
              <p>
                <strong>栄養情報あり:</strong>{' '}
                {
                  ingredients.filter(
                    (ingredient) =>
                      ingredient.calories ||
                      ingredient.protein ||
                      ingredient.fat ||
                      ingredient.carbs,
                  ).length
                }{' '}
                件
              </p>
              <p className="muted-copy">
                食材の追加・編集はモーダルで行えるので、一覧の文脈を保ったまま作業できます。
              </p>
            </div>
          </article>
        </div>
      </section>
    );
  };

  const renderMealsView = () => {
    return (
      <section className="content-grid">
        <article className="panel section-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Meal Timeline</p>
              <h2>食事記録一覧</h2>
            </div>
            <div className="panel-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => navigateTo('overview')}
              >
                Dashboard へ
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={openMealComposer}
              >
                記録を追加
              </button>
            </div>
          </div>

          <div className="summary-strip">
            <div className="summary-chip">
              <span>総記録数</span>
              <strong>{meals.length}</strong>
            </div>
            <div className="summary-chip">
              <span>多い時間帯</span>
              <strong>
                {dominantMeal?.count ? dominantMeal.mealType : '未記録'}
              </strong>
            </div>
            <div className="summary-chip">
              <span>平均満足度</span>
              <strong>{averageSatisfaction}</strong>
            </div>
          </div>

          <div className="list-stack">
            {meals.length ? (
              meals.map((meal) => (
                <div key={meal.id} className="list-row list-row-detailed">
                  <div className="list-copy">
                    <strong>{meal.menuName}</strong>
                    <p>
                      {meal.consumedOn} / {meal.mealType}
                      {meal.satisfaction
                        ? ` / 満足度 ${meal.satisfaction}`
                        : ''}
                    </p>
                    {meal.note ? (
                      <p className="muted-copy">{meal.note}</p>
                    ) : null}
                  </div>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => startMealEdit(meal)}
                    >
                      編集
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => deleteMeal(meal.id)}
                    >
                      削除
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-copy">
                まだ食事記録はありません。右上のボタンから追加してください。
              </p>
            )}
          </div>
        </article>

        <div className="side-stack">
          <article className="panel section-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Pattern</p>
                <h2>傾向メモ</h2>
              </div>
            </div>
            <div className="preference-preview">
              <p>
                <strong>最近の食事傾向:</strong>{' '}
                {suggestion?.recentPattern ??
                  '提案生成後に傾向が表示されます。'}
              </p>
              <p>
                <strong>最新記録:</strong>{' '}
                {latestMeals[0]
                  ? `${latestMeals[0].consumedOn} / ${latestMeals[0].menuName}`
                  : '未登録'}
              </p>
            </div>
          </article>

          <article className="panel section-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Actions</p>
                <h2>次の操作</h2>
              </div>
            </div>

            <div className="quick-grid">
              <button
                type="button"
                className="secondary-button quick-action-button"
                onClick={() => navigateTo('suggestion')}
              >
                提案を確認
              </button>
              <button
                type="button"
                className="secondary-button quick-action-button"
                onClick={handleGenerateSuggestion}
                disabled={busy}
              >
                {suggestion ? '保存済み提案を開く' : '今日の提案を生成'}
              </button>
            </div>
          </article>
        </div>
      </section>
    );
  };

  const renderSettingsView = () => {
    return (
      <section className="settings-grid">
        <article className="panel section-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Personal Constraints</p>
              <h2>個人条件</h2>
            </div>
          </div>

          <form className="data-form" onSubmit={handlePreferencesSubmit}>
            <div className="form-grid">
              <TagInputField
                label="アレルギー"
                values={preferenceDraft.allergies}
                inputValue={preferenceDraft.allergyInput}
                onInputChange={(value) =>
                  setPreferenceDraft((current) => ({
                    ...current,
                    allergyInput: value,
                  }))
                }
                onCommit={commitAllergyInput}
                onRemove={removeAllergyTag}
                placeholder="例: えび, かに"
              />
              <TagInputField
                label="苦手食材"
                values={preferenceDraft.dislikes}
                inputValue={preferenceDraft.dislikeInput}
                onInputChange={(value) =>
                  setPreferenceDraft((current) => ({
                    ...current,
                    dislikeInput: value,
                  }))
                }
                onCommit={commitDislikeInput}
                onRemove={removeDislikeTag}
                placeholder="例: セロリ, パクチー"
              />
              <TagInputField
                label="補足メモ"
                values={preferenceDraft.notes}
                inputValue={preferenceDraft.noteInput}
                onInputChange={(value) =>
                  setPreferenceDraft((current) => ({
                    ...current,
                    noteInput: value,
                  }))
                }
                onCommit={commitNoteInput}
                onRemove={removeNoteTag}
                placeholder="例: 平日は20分以内 / 野菜多め"
              />
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
              {preferences.allergies.length
                ? preferences.allergies.join('、')
                : '未設定'}
            </p>
            <p>
              <strong>苦手食材:</strong>{' '}
              {preferences.dislikes.length
                ? preferences.dislikes.join('、')
                : '未設定'}
            </p>
            <p>
              <strong>補足:</strong>{' '}
              {preferences.notes.length
                ? preferences.notes.join('、')
                : '未設定'}
            </p>
          </div>
        </article>

        <article className="panel section-panel">
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
                    void handleLlmProviderChange(
                      event.target.value as LlmProvider,
                    );
                  }}
                >
                  {(Object.keys(providerLabels) as LlmProvider[]).map(
                    (provider) => (
                      <option key={provider} value={provider}>
                        {providerLabels[provider]}
                      </option>
                    ),
                  )}
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
                      {llmCatalogLoading
                        ? 'モデル一覧を読み込んでいます...'
                        : '利用可能なモデルがありません'}
                    </option>
                  )}
                </select>
              </label>
              <label className="full-width">
                <span>API Key</span>
                <input
                  type="password"
                  value={llmApiKeyInput}
                  onChange={(event) => {
                    setLlmApiKeyInput(event.target.value);
                    if (clearStoredLlmApiKey) {
                      setClearStoredLlmApiKey(false);
                    }
                  }}
                  placeholder={`${providerLabels[llmDraft.provider]} の API キーを入力`}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <div className="full-width ai-status-box">
                <div className="status-row">
                  <span
                    className={`status-pill ${llmCatalog?.available ? 'available' : 'unavailable'}`}
                  >
                    {llmCatalog?.available ? '利用可能' : '要設定'}
                  </span>
                  <span className="status-pill neutral">
                    保存済み: {formatLlmSelection(llmSettings)}
                  </span>
                  <span
                    className={`status-pill ${selectedCredentialStatus.configured ? 'available' : 'unavailable'}`}
                  >
                    {formatCredentialStatusLabel(selectedCredentialStatus)}
                  </span>
                </div>
                <p className="muted-copy">
                  {llmCatalogLoading
                    ? '選択中 provider のモデル一覧を取得しています。'
                    : (llmCatalog?.reason ??
                      'サーバー側の API キーで利用可能なモデル候補を表示しています。')}
                </p>
                <p className="muted-copy">
                  {hasDraftApiKey
                    ? 'この入力欄のキーは保存前でもモデル確認に使えます。保存後は再表示されません。'
                    : formatCredentialStatusNote(selectedCredentialStatus)}
                </p>
                {selectedCredentialStatus.source === 'user' &&
                selectedCredentialStatus.keyHint ? (
                  <p className="muted-copy">
                    現在の保存済みキー: {selectedCredentialStatus.keyHint}
                  </p>
                ) : null}
                <label className="credential-toggle">
                  <input
                    type="checkbox"
                    checked={clearStoredLlmApiKey}
                    onChange={(event) => {
                      setClearStoredLlmApiKey(event.target.checked);
                      if (event.target.checked) {
                        setLlmApiKeyInput('');
                      }
                    }}
                    disabled={!canClearStoredApiKey}
                  />
                  <span>この provider に保存済みの API キーを削除する</span>
                </label>
                {llmCatalog?.available && !selectedModelAvailable ? (
                  <p className="muted-copy">
                    現在の保存値は最新の catalog に含まれていません。利用可能な
                    model に切り替えて保存してください。
                  </p>
                ) : null}
                {selectedLlmModel ? (
                  <div className="model-meta">
                    <strong>{selectedLlmModel.name}</strong>
                    <p>
                      {selectedLlmModel.description ?? '説明はありません。'}
                    </p>
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
                type="button"
                className="secondary-button"
                onClick={handleLlmCatalogPreview}
                disabled={
                  busy ||
                  llmCatalogLoading ||
                  (!hasDraftApiKey && !clearStoredLlmApiKey)
                }
              >
                入力中のキーでモデル一覧を確認
              </button>
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
              <strong>現在の provider:</strong>{' '}
              {providerLabels[llmSettings.provider]}
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
            <p>
              <strong>OpenAI 認証:</strong>{' '}
              {formatCredentialStatusLabel(llmSettings.credentialStatus.openai)}
            </p>
            <p>
              <strong>OpenRouter 認証:</strong>{' '}
              {formatCredentialStatusLabel(
                llmSettings.credentialStatus.openrouter,
              )}
            </p>
          </div>
        </article>
      </section>
    );
  };

  const renderActiveView = () => {
    switch (activeView) {
      case 'overview':
        return renderOverview();
      case 'suggestion':
        return renderSuggestionPanel('full');
      case 'ingredients':
        return renderIngredientsView();
      case 'meals':
        return renderMealsView();
      case 'settings':
        return renderSettingsView();
      default:
        return null;
    }
  };

  const pageAction = (() => {
    switch (activeView) {
      case 'overview':
      case 'suggestion':
        return (
          <button
            type="button"
            className="primary-button"
            onClick={handleGenerateSuggestion}
            disabled={busy}
          >
            {suggestion ? '保存済みを開く' : '今日の提案を生成'}
          </button>
        );
      case 'ingredients':
        return (
          <button
            type="button"
            className="primary-button"
            onClick={openIngredientComposer}
          >
            食材を追加
          </button>
        );
      case 'meals':
        return (
          <button
            type="button"
            className="primary-button"
            onClick={openMealComposer}
          >
            記録を追加
          </button>
        );
      default:
        return null;
    }
  })();

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
    <main
      className={`app-shell ${session ? 'session-shell' : ''} ${sidebarOpen ? 'sidebar-open' : ''}`}
    >
      <div className="backdrop backdrop-left" />
      <div className="backdrop backdrop-right" />

      <header className="headbar">
        <div className="headbar-brand">
          {session ? (
            <button
              type="button"
              className="secondary-button mobile-menu-button headbar-menu-button"
              onClick={() => setSidebarOpen(true)}
            >
              メニュー
            </button>
          ) : null}
          <div className="headbar-copy">
            <p className="eyebrow">Aiva</p>
            <h2>
              {session ? '食事支援ダッシュボード' : 'AI 食生活アシスタント'}
            </h2>
          </div>
          <span className="headbar-chip">
            {session ? activeViewMeta.title : 'Welcome'}
          </span>
        </div>

        <div className="headbar-actions">
          {session ? (
            <div className="account-badge headbar-account">
              <span>{session.user.name}</span>
              <small>{session.user.email}</small>
            </div>
          ) : null}

          <button
            type="button"
            className="secondary-button theme-toggle"
            onClick={toggleTheme}
          >
            <span>{theme === 'dark' ? 'ダーク表示' : 'ライト表示'}</span>
            <strong>
              {theme === 'dark' ? 'ライトへ切替' : 'ダークへ切替'}
            </strong>
          </button>

          {session ? (
            <button
              type="button"
              className="primary-button"
              onClick={handleSignOut}
              disabled={busy}
            >
              ログアウト
            </button>
          ) : (
            <button
              type="button"
              className="primary-button"
              onClick={handleGoogleSignIn}
              disabled={busy}
            >
              Google でログイン
            </button>
          )}
        </div>
      </header>

      {!session ? (
        <>
          <section className="hero-panel">
            <div>
              <p className="eyebrow">Mastra + Better Auth + PostgreSQL</p>
              <h1>Aiva</h1>
              <p className="hero-copy">
                登録済みの食材、最近の食事記録、苦手・アレルギー条件をまとめて読み取り、
                その日の献立を日本語で提案する生活支援アプリです。
              </p>
            </div>

            <div className="hero-actions hero-actions-inline">
              <span className="headbar-chip">Sidebar</span>
              <span className="headbar-chip">Modal</span>
              <span className="headbar-chip">Dashboard</span>
            </div>
          </section>

          {error ? <p className="error-banner">{error}</p> : null}

          <section className="landing-grid">
            <article className="feature-card">
              <h2>Sidebar ベースの管理画面</h2>
              <p>
                Dashboard、食材、食事、設定をページ感覚で切り替え、必要な操作に集中できます。
              </p>
            </article>
            <article className="feature-card">
              <h2>モーダルで素早く編集</h2>
              <p>
                一覧を離れずに食材や食事記録を追加・編集できるので、操作の流れが分断されません。
              </p>
            </article>
            <article className="feature-card">
              <h2>提案を中心に再配置</h2>
              <p>
                今日の献立提案を軸に、在庫アラートと食事傾向を隣接配置したダッシュボードです。
              </p>
            </article>
          </section>
        </>
      ) : (
        <>
          <button
            type="button"
            className={`sidebar-scrim ${sidebarOpen ? 'open' : ''}`}
            onClick={() => setSidebarOpen(false)}
            aria-label="サイドバーを閉じる"
          />

          <aside
            className={`mobile-sidebar-drawer ${sidebarOpen ? 'open' : ''}`}
            aria-hidden={!sidebarOpen}
          >
            <div className="mobile-sidebar-topbar">
              <p className="eyebrow">Menu</p>
              <button
                type="button"
                className="secondary-button mobile-sidebar-close-button"
                onClick={() => setSidebarOpen(false)}
              >
                閉じる
              </button>
            </div>
            {renderSidebarContent()}
          </aside>

          <div className="workspace-shell">
            <aside className="sidebar desktop-sidebar">
              {renderSidebarContent()}
            </aside>

            <section className="workspace-main">
              <section className="hero-panel workspace-hero">
                <div>
                  <div className="hero-eyebrow-row">
                    <p className="eyebrow">{activeViewMeta.eyebrow}</p>
                  </div>
                  <h1>{activeViewMeta.title}</h1>
                  <p className="hero-copy">{activeViewMeta.description}</p>
                </div>

                <div className="hero-actions">{pageAction}</div>
              </section>

              {error ? <p className="error-banner">{error}</p> : null}

              <section className="workspace-body">{renderActiveView()}</section>
            </section>
          </div>

          <nav className="mobile-dock" aria-label="モバイル操作バー">
            <button
              type="button"
              className="mobile-dock-button"
              onClick={openIngredientComposer}
            >
              <strong>食材登録</strong>
              <span>在庫を追加</span>
            </button>
            <button
              type="button"
              className="mobile-dock-button"
              onClick={openMealComposer}
            >
              <strong>食事記録</strong>
              <span>履歴を追加</span>
            </button>
            <button
              type="button"
              className={`mobile-dock-status ${suggestion ? 'ready' : 'pending'}`}
              onClick={handleSuggestionDockClick}
              disabled={busy}
            >
              <span>今日の提案</span>
              <strong>{suggestionStatusLabel}</strong>
              <small>{suggestionStatusDetail}</small>
            </button>
          </nav>
        </>
      )}

      <ModalShell
        open={suggestionModalOpen}
        title="Today&apos;s Suggestion"
        description="今日の提案を確認"
        onClose={closeSuggestionModal}
      >
        {suggestionModalState === 'loading' ? (
          <div className="modal-state">
            <p>本日の提案を確認しています...</p>
            <p className="muted-copy">
              すでに生成済みなら保存済みの内容を表示し、未生成のときだけ新しく作成します。
            </p>
          </div>
        ) : null}

        {suggestionModalState === 'error' ? (
          <div className="modal-state">
            <p className="error-banner modal-error-banner">
              {suggestionModalMessage ?? '提案生成に失敗しました。'}
            </p>
            <div className="form-actions">
              <button
                type="button"
                className="primary-button"
                onClick={handleSuggestionDockClick}
                disabled={busy}
              >
                もう一度試す
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={closeSuggestionModal}
              >
                閉じる
              </button>
            </div>
          </div>
        ) : null}

        {suggestionModalState === 'ready' && suggestionModalSuggestion ? (
          <div className="suggestion-stack">
            <div className="suggestion-modal-pills">
              <span className="status-pill available">保存済み</span>
              {suggestionModalMessage ? (
                <span className="status-pill neutral">
                  {suggestionModalMessage}
                </span>
              ) : null}
            </div>

            <div className="suggestion-summary">
              <h3>提案メモ</h3>
              <p>{suggestionModalSuggestion.note}</p>
              <p className="muted-copy">
                {suggestionModalSuggestion.recentPattern}
              </p>
              <p className="muted-copy">
                使用モデル:{' '}
                {formatLlmSelection(
                  suggestionModalSuggestion.llm ?? llmSettings,
                )}
              </p>
            </div>

            <div className="priority-list">
              {suggestionModalSuggestion.priorities.map((priority) => (
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
              {suggestionModalSuggestion.meals.map((meal) => (
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

            <div className="form-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  closeSuggestionModal();
                  navigateTo('suggestion');
                }}
              >
                保存済みの提案を開く
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={closeSuggestionModal}
              >
                閉じる
              </button>
            </div>
          </div>
        ) : null}
      </ModalShell>

      <ModalShell
        open={ingredientModalOpen}
        title={editingIngredientId ? 'Edit Ingredient' : 'New Ingredient'}
        description={editingIngredientId ? '食材を編集' : '食材を追加'}
        onClose={closeIngredientModal}
      >
        <form
          className="data-form modal-form"
          onSubmit={handleIngredientSubmit}
        >
          <div className="form-grid">
            <label>
              <span>食材名</span>
              <input
                value={ingredientForm.name}
                onChange={(event) =>
                  setIngredientForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
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
                rows={3}
              />
            </label>
          </div>

          <div className="form-actions">
            <button type="submit" className="primary-button" disabled={busy}>
              {editingIngredientId ? '食材を更新' : '食材を追加'}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={closeIngredientModal}
            >
              キャンセル
            </button>
          </div>
        </form>
      </ModalShell>

      <ModalShell
        open={mealModalOpen}
        title={editingMealId ? 'Edit Meal Log' : 'New Meal Log'}
        description={editingMealId ? '食事記録を編集' : '食事記録を追加'}
        onClose={closeMealModal}
      >
        <form className="data-form modal-form" onSubmit={handleMealSubmit}>
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
                rows={3}
              />
            </label>
          </div>

          <div className="form-actions">
            <button type="submit" className="primary-button" disabled={busy}>
              {editingMealId ? '記録を更新' : '記録を追加'}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={closeMealModal}
            >
              キャンセル
            </button>
          </div>
        </form>
      </ModalShell>
    </main>
  );
};

export default App;
