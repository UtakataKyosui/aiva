import { createHash } from 'node:crypto';
import {
  type LlmCatalogResponse,
  type LlmCredentialStatusMap,
  type LlmModelOption,
  type LlmProvider,
  llmCatalogResponseSchema,
  llmCredentialStatusMapSchema,
  llmModelOptionSchema,
  llmProviderSchema,
  type UserLlmSettingsInput,
  userLlmSettingsInputSchema,
} from '@aiva/shared';
import { z } from 'zod';
import { env } from '../env';
import { decryptSecret, encryptSecret } from './secret-box';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models/user';
const OPENROUTER_CACHE_TTL_MS = 1000 * 60 * 5;

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

const storedProviderKeySchema = z.object({
  ciphertext: z.string().min(1),
  lastFour: z.string().min(1),
});

const providerKeyStoreSchema = z.object({
  openai: storedProviderKeySchema.optional(),
  openrouter: storedProviderKeySchema.optional(),
});

type ProviderKeyStore = z.infer<typeof providerKeyStoreSchema>;

const openRouterCache = new Map<
  string,
  {
    expiresAt: number;
    catalog: LlmCatalogResponse;
  }
>();

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

const getOpenRouterCacheKey = (apiKey: string) => {
  return createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
};

const normalizeProviderKeys = (providerKeys: unknown): ProviderKeyStore => {
  return providerKeyStoreSchema.parse(providerKeys ?? {});
};

const getServerApiKey = (provider: LlmProvider) => {
  return provider === 'openai'
    ? (env.OPENAI_API_KEY ?? null)
    : (env.OPENROUTER_API_KEY ?? null);
};

const getStoredProviderKey = (providerKeys: unknown, provider: LlmProvider) => {
  return normalizeProviderKeys(providerKeys)[provider] ?? null;
};

const maskKeyHint = (lastFour: string) => {
  return `••••${lastFour}`;
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

export const getPreferredOpenRouterModelId = (models: LlmModelOption[]) => {
  const preferred = preferredOpenRouterModels.find((modelId) =>
    models.some((model) => model.id === modelId),
  );

  return preferred ?? models[0]?.id ?? preferredOpenRouterModels[0];
};

export const withStoredProviderApiKey = (
  providerKeys: unknown,
  provider: LlmProvider,
  apiKey: string,
) => {
  const trimmedApiKey = apiKey.trim();

  if (!trimmedApiKey) {
    return normalizeProviderKeys(providerKeys);
  }

  return providerKeyStoreSchema.parse({
    ...normalizeProviderKeys(providerKeys),
    [provider]: {
      ciphertext: encryptSecret(trimmedApiKey),
      lastFour: trimmedApiKey.slice(-4),
    },
  });
};

export const withoutStoredProviderApiKey = (
  providerKeys: unknown,
  provider: LlmProvider,
) => {
  const nextKeys = { ...normalizeProviderKeys(providerKeys) };
  delete nextKeys[provider];
  return providerKeyStoreSchema.parse(nextKeys);
};

export const resolveProviderApiKey = (
  provider: LlmProvider,
  providerKeys?: unknown,
) => {
  const storedKey = getStoredProviderKey(providerKeys, provider);

  if (storedKey) {
    return decryptSecret(storedKey.ciphertext);
  }

  return getServerApiKey(provider);
};

export const buildCredentialStatusMap = (
  providerKeys?: unknown,
): LlmCredentialStatusMap => {
  const normalizedKeys = normalizeProviderKeys(providerKeys);

  return llmCredentialStatusMapSchema.parse({
    openai: normalizedKeys.openai
      ? {
          configured: true,
          source: 'user',
          keyHint: maskKeyHint(normalizedKeys.openai.lastFour),
        }
      : {
          configured: Boolean(getServerApiKey('openai')),
          source: getServerApiKey('openai') ? 'server' : 'none',
          keyHint: null,
        },
    openrouter: normalizedKeys.openrouter
      ? {
          configured: true,
          source: 'user',
          keyHint: maskKeyHint(normalizedKeys.openrouter.lastFour),
        }
      : {
          configured: Boolean(getServerApiKey('openrouter')),
          source: getServerApiKey('openrouter') ? 'server' : 'none',
          keyHint: null,
        },
  });
};

export const getOpenAiModelCatalog = (options?: { apiKey?: string | null }) => {
  const effectiveApiKey = options?.apiKey?.trim() || getServerApiKey('openai');

  return llmCatalogResponseSchema.parse({
    provider: 'openai',
    available: Boolean(effectiveApiKey),
    reason: effectiveApiKey ? null : 'OpenAI のAPIキーが未設定です。',
    models: openAiModelOptions,
  });
};

export const getOpenRouterModelCatalog = async (options?: {
  apiKey?: string | null;
}) => {
  const effectiveApiKey =
    options?.apiKey?.trim() || getServerApiKey('openrouter');

  if (!effectiveApiKey) {
    return createUnavailableCatalog(
      'openrouter',
      'OpenRouter のAPIキーが未設定です。',
    );
  }

  const cacheKey = getOpenRouterCacheKey(effectiveApiKey);
  const cached = openRouterCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.catalog;
  }

  const response = await fetch(OPENROUTER_MODELS_URL, {
    headers: {
      Authorization: `Bearer ${effectiveApiKey}`,
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

  openRouterCache.set(cacheKey, {
    catalog,
    expiresAt: Date.now() + OPENROUTER_CACHE_TTL_MS,
  });

  return catalog;
};

export const getModelCatalog = async (
  provider: LlmProvider,
  options?: {
    apiKey?: string | null;
  },
) => {
  return provider === 'openai'
    ? getOpenAiModelCatalog(options)
    : getOpenRouterModelCatalog(options);
};

export const getDefaultLlmSettings = async (options?: {
  providerKeys?: unknown;
}): Promise<UserLlmSettingsInput> => {
  if (resolveProviderApiKey('openai', options?.providerKeys)) {
    return {
      provider: 'openai',
      modelId: openAiModelOptions[0].id,
    };
  }

  if (resolveProviderApiKey('openrouter', options?.providerKeys)) {
    const catalog = await getOpenRouterModelCatalog({
      apiKey: resolveProviderApiKey('openrouter', options?.providerKeys),
    });

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
  options?: {
    providerKeys?: unknown;
  },
): Promise<UserLlmSettingsInput> => {
  if (settings) {
    return userLlmSettingsInputSchema.parse(settings);
  }

  return getDefaultLlmSettings(options);
};

export const validateLlmSettings = async (
  settings: UserLlmSettingsInput,
  options?: {
    apiKey?: string | null;
  },
) => {
  const parsed = userLlmSettingsInputSchema.parse(settings);
  const catalog = await getModelCatalog(parsed.provider, options);

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
  return `${parsed.provider}/${parsed.modelId}`;
};

export const providerLabel = (provider: LlmProvider) => {
  return llmProviderSchema.parse(provider) === 'openrouter'
    ? 'OpenRouter'
    : 'OpenAI';
};
