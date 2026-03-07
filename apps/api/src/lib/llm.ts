import {
  type LlmCatalogResponse,
  type LlmModelOption,
  type LlmProvider,
  llmCatalogResponseSchema,
  llmModelOptionSchema,
  llmProviderSchema,
  type UserLlmSettingsInput,
  userLlmSettingsInputSchema,
} from '@aiva/shared';
import { z } from 'zod';
import { env } from '../env.js';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models/user';
const SELF_HOSTED_PROVIDER_ID = 'local';
const SELF_HOSTED_DEFAULT_API_KEY = 'ollama';
const MODEL_CACHE_TTL_MS = 1000 * 60 * 5;

const openAiModelOptions = [
  {
    id: 'gpt-5-mini',
    name: 'GPT-5 mini',
    description: '高速でコスト効率の良い既定モデルです。',
    contextLength: 400_000,
    supportsStructuredOutput: true,
  },
  {
    id: 'gpt-5.2',
    name: 'GPT-5.2',
    description: '品質優先のフラッグシップモデルです。',
    contextLength: 400_000,
    supportsStructuredOutput: true,
  },
  {
    id: 'gpt-5-nano',
    name: 'GPT-5 nano',
    description: '最速・最小コスト寄りのモデルです。',
    contextLength: 400_000,
    supportsStructuredOutput: true,
  },
  {
    id: 'gpt-4.1-mini',
    name: 'GPT-4.1 mini',
    description: '低遅延で安定した汎用モデルです。',
    contextLength: 1_047_576,
    supportsStructuredOutput: true,
  },
] satisfies LlmModelOption[];

const preferredOpenRouterModels = [
  'openai/gpt-5-mini',
  'openai/gpt-4.1-mini',
  'openai/gpt-4o-mini',
];

const openRouterCatalogResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
      context_length: z.coerce.number().nullable().optional(),
      supported_parameters: z.array(z.string()).nullable().optional(),
      architecture: z
        .object({
          input_modalities: z.array(z.string()).nullable().optional(),
          output_modalities: z.array(z.string()).nullable().optional(),
        })
        .nullable()
        .optional(),
    }),
  ),
});

const selfHostedCatalogResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string().nullable().optional(),
      owned_by: z.string().nullable().optional(),
      context_length: z.coerce.number().nullable().optional(),
    }),
  ),
});

let openRouterCache: {
  expiresAt: number;
  catalog: LlmCatalogResponse;
} | null = null;

let selfHostedCache: {
  baseUrl: string;
  expiresAt: number;
  catalog: LlmCatalogResponse;
} | null = null;

const createUnavailableCatalog = (
  provider: LlmProvider,
  reason: string,
  models: LlmModelOption[] = [],
) => {
  return llmCatalogResponseSchema.parse({
    provider,
    available: false,
    reason,
    models,
  });
};

const supportsTextIo = (
  model: z.infer<typeof openRouterCatalogResponseSchema.shape.data.element>,
) => {
  const inputModalities = model.architecture?.input_modalities ?? [];
  const outputModalities = model.architecture?.output_modalities ?? [];

  return (
    (inputModalities.length === 0 || inputModalities.includes('text')) &&
    (outputModalities.length === 0 || outputModalities.includes('text'))
  );
};

const supportsStructuredOutput = (
  supportedParameters: string[] | null | undefined,
) => {
  const parameters = supportedParameters ?? [];

  return parameters.some((parameter) =>
    ['response_format', 'structured_outputs', 'json_schema'].includes(
      parameter,
    ),
  );
};

const ensureTrailingSlash = (value: string) => {
  return value.endsWith('/') ? value : `${value}/`;
};

export const getSelfHostedProviderName = () => {
  return env.LOCAL_LLM_PROVIDER_NAME ?? 'ローカル / サーバ LLM';
};

export const getSelfHostedBaseUrl = () => {
  return env.LOCAL_LLM_BASE_URL?.replace(/\/+$/, '') ?? null;
};

export const getSelfHostedApiKey = () => {
  return env.LOCAL_LLM_API_KEY ?? SELF_HOSTED_DEFAULT_API_KEY;
};

const getSelfHostedModelsUrl = () => {
  const baseUrl = getSelfHostedBaseUrl();

  if (!baseUrl) {
    return null;
  }

  return new URL('models', ensureTrailingSlash(baseUrl)).toString();
};

export const normalizeOpenRouterCatalog = (payload: unknown) => {
  const parsed = openRouterCatalogResponseSchema.parse(payload);

  return parsed.data
    .filter(supportsTextIo)
    .map((model) =>
      llmModelOptionSchema.parse({
        id: model.id,
        name: model.name?.trim() || model.id,
        description: model.description?.trim() || null,
        contextLength: model.context_length ?? null,
        supportsStructuredOutput: supportsStructuredOutput(
          model.supported_parameters,
        ),
      }),
    )
    .sort((left, right) => left.name.localeCompare(right.name, 'ja'));
};

export const normalizeSelfHostedCatalog = (payload: unknown) => {
  const parsed = selfHostedCatalogResponseSchema.parse(payload);

  return parsed.data.map((model) =>
    llmModelOptionSchema.parse({
      id: model.id,
      name: model.name?.trim() || model.id,
      description: model.owned_by ? `提供元: ${model.owned_by}` : null,
      contextLength: model.context_length ?? null,
      supportsStructuredOutput: false,
    }),
  );
};

export const getPreferredOpenRouterModelId = (models: LlmModelOption[]) => {
  const preferred = preferredOpenRouterModels.find((modelId) =>
    models.some((model) => model.id === modelId),
  );

  return preferred ?? models[0]?.id ?? preferredOpenRouterModels[0];
};

export const getPreferredSelfHostedModelId = (models: LlmModelOption[]) => {
  return models[0]?.id ?? '';
};

export const isProviderConfigured = (provider: LlmProvider) => {
  switch (provider) {
    case 'openai':
      return Boolean(env.OPENAI_API_KEY);
    case 'openrouter':
      return Boolean(env.OPENROUTER_API_KEY);
    case 'selfhosted':
      return Boolean(getSelfHostedBaseUrl());
  }
};

export const getOpenAiModelCatalog = () => {
  return llmCatalogResponseSchema.parse({
    provider: 'openai',
    available: Boolean(env.OPENAI_API_KEY),
    reason: env.OPENAI_API_KEY ? null : 'OPENAI_API_KEY が未設定です。',
    models: openAiModelOptions,
  });
};

export const getOpenRouterModelCatalog = async () => {
  if (!env.OPENROUTER_API_KEY) {
    return createUnavailableCatalog(
      'openrouter',
      'OPENROUTER_API_KEY が未設定です。',
    );
  }

  if (openRouterCache && openRouterCache.expiresAt > Date.now()) {
    return openRouterCache.catalog;
  }

  const response = await fetch(OPENROUTER_MODELS_URL, {
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'HTTP-Referer': env.WEB_ORIGIN,
      'X-Title': 'Aiva',
    },
  });

  if (!response.ok) {
    throw new Error(
      `OpenRouter model catalog request failed with status ${response.status}.`,
    );
  }

  const models = normalizeOpenRouterCatalog(await response.json());
  const catalog =
    models.length > 0
      ? llmCatalogResponseSchema.parse({
          provider: 'openrouter',
          available: true,
          reason: null,
          models,
        })
      : createUnavailableCatalog(
          'openrouter',
          '利用可能なテキスト出力モデルが見つかりませんでした。',
        );

  openRouterCache = {
    catalog,
    expiresAt: Date.now() + MODEL_CACHE_TTL_MS,
  };

  return catalog;
};

export const getSelfHostedModelCatalog = async () => {
  const modelsUrl = getSelfHostedModelsUrl();

  if (!modelsUrl) {
    return createUnavailableCatalog(
      'selfhosted',
      'LOCAL_LLM_BASE_URL が未設定です。',
    );
  }

  const baseUrl = getSelfHostedBaseUrl();

  if (
    selfHostedCache &&
    baseUrl &&
    selfHostedCache.baseUrl === baseUrl &&
    selfHostedCache.expiresAt > Date.now()
  ) {
    return selfHostedCache.catalog;
  }

  const response = await fetch(modelsUrl, {
    headers: {
      Authorization: `Bearer ${getSelfHostedApiKey()}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(
      `${getSelfHostedProviderName()} model catalog request failed with status ${response.status}.`,
    );
  }

  const models = normalizeSelfHostedCatalog(await response.json());
  const catalog =
    models.length > 0
      ? llmCatalogResponseSchema.parse({
          provider: 'selfhosted',
          available: true,
          reason: `${getSelfHostedProviderName()} からモデル一覧を取得しました。`,
          models,
        })
      : createUnavailableCatalog(
          'selfhosted',
          `${getSelfHostedProviderName()} で利用可能なモデルが見つかりませんでした。`,
        );

  if (baseUrl) {
    selfHostedCache = {
      baseUrl,
      catalog,
      expiresAt: Date.now() + MODEL_CACHE_TTL_MS,
    };
  }

  return catalog;
};

export const getModelCatalog = async (provider: LlmProvider) => {
  switch (provider) {
    case 'openai':
      return getOpenAiModelCatalog();
    case 'openrouter':
      return getOpenRouterModelCatalog();
    case 'selfhosted':
      return getSelfHostedModelCatalog();
  }
};

export const getDefaultLlmSettings =
  async (): Promise<UserLlmSettingsInput> => {
    if (getSelfHostedBaseUrl()) {
      try {
        const catalog = await getSelfHostedModelCatalog();

        if (catalog.available && catalog.models.length > 0) {
          return {
            provider: 'selfhosted',
            modelId: getPreferredSelfHostedModelId(catalog.models),
          };
        }
      } catch (error) {
        console.warn(
          'Failed to resolve self-hosted model catalog while choosing default LLM settings.',
          error,
        );
      }
    }

    if (env.OPENAI_API_KEY) {
      return {
        provider: 'openai',
        modelId: openAiModelOptions[0].id,
      };
    }

    if (env.OPENROUTER_API_KEY) {
      const catalog = await getOpenRouterModelCatalog();

      return {
        provider: 'openrouter',
        modelId: getPreferredOpenRouterModelId(catalog.models),
      };
    }

    return {
      provider: 'openai',
      modelId: openAiModelOptions[0].id,
    };
  };

export const resolveStoredLlmSettings = async (
  settings: UserLlmSettingsInput | null,
): Promise<UserLlmSettingsInput> => {
  if (settings) {
    return userLlmSettingsInputSchema.parse(settings);
  }

  return getDefaultLlmSettings();
};

export const validateLlmSettings = async (settings: UserLlmSettingsInput) => {
  const parsed = userLlmSettingsInputSchema.parse(settings);
  const catalog = await getModelCatalog(parsed.provider);

  if (!catalog.available) {
    return catalog.reason ?? `${parsed.provider} は現在利用できません。`;
  }

  if (!catalog.models.some((model) => model.id === parsed.modelId)) {
    return '選択されたモデルは現在の provider では利用できません。';
  }

  return null;
};

export const toMastraModelId = (settings: UserLlmSettingsInput) => {
  const parsed = userLlmSettingsInputSchema.parse(settings);

  switch (parsed.provider) {
    case 'openai':
      return `openai/${parsed.modelId}`;
    case 'openrouter':
      return `openrouter/${parsed.modelId}`;
    case 'selfhosted':
      return `selfhosted/${SELF_HOSTED_PROVIDER_ID}/${parsed.modelId}`;
  }
};

export const providerLabel = (provider: LlmProvider) => {
  switch (llmProviderSchema.parse(provider)) {
    case 'openai':
      return 'OpenAI';
    case 'openrouter':
      return 'OpenRouter';
    case 'selfhosted':
      return getSelfHostedProviderName();
  }
};
