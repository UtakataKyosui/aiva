import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/aiva';
process.env.BETTER_AUTH_SECRET ??= '0123456789abcdef0123456789abcdef';
process.env.BETTER_AUTH_URL ??= 'http://localhost:4112/api/auth';
process.env.WEB_ORIGIN ??= 'http://localhost:3000';
process.env.GOOGLE_CLIENT_ID ??= 'dummy';
process.env.GOOGLE_CLIENT_SECRET ??= 'dummy';
process.env.OPENAI_API_KEY ??= 'sk-openai-server-test';
process.env.OPENROUTER_API_KEY ??= 'sk-openrouter-server-test';
process.env.LLM_CREDENTIAL_SECRET ??= 'llm-credential-secret-for-tests';

const {
  buildCredentialStatusMap,
  getOpenAiModelCatalog,
  getPreferredOpenRouterModelId,
  normalizeOpenRouterCatalog,
  resolveProviderApiKey,
  toMastraModelId,
  withStoredProviderApiKey,
  withoutStoredProviderApiKey,
} = await import('./llm.js');

test('normalizeOpenRouterCatalog keeps text models and maps labels', () => {
  const models = normalizeOpenRouterCatalog({
    data: [
      {
        id: 'openai/gpt-5-mini',
        name: 'GPT-5 mini',
        description: 'Fast OpenAI model',
        context_length: 400000,
        supported_parameters: ['response_format'],
        architecture: {
          input_modalities: ['text'],
          output_modalities: ['text'],
        },
      },
      {
        id: 'image/example',
        name: 'Image only model',
        architecture: {
          input_modalities: ['image'],
          output_modalities: ['image'],
        },
      },
    ],
  });

  assert.equal(models.length, 1);
  assert.equal(models[0]?.id, 'openai/gpt-5-mini');
  assert.equal(models[0]?.supportsStructuredOutput, true);
});

test('getPreferredOpenRouterModelId picks preferred ids before fallback', () => {
  const preferred = getPreferredOpenRouterModelId([
    {
      id: 'openai/gpt-4o-mini',
      name: 'GPT-4o mini',
      description: null,
      contextLength: 128000,
      supportsStructuredOutput: true,
    },
    {
      id: 'custom/other-model',
      name: 'Other',
      description: null,
      contextLength: null,
      supportsStructuredOutput: false,
    },
  ]);

  assert.equal(preferred, 'openai/gpt-4o-mini');
});

test('toMastraModelId prefixes provider name', () => {
  assert.equal(
    toMastraModelId({
      provider: 'openrouter',
      modelId: 'openai/gpt-5-mini',
    }),
    'openrouter/openai/gpt-5-mini',
  );
});

test('stored provider key overrides the server key for the same provider', () => {
  const providerKeys = withStoredProviderApiKey(
    {},
    'openrouter',
    'sk-user-openrouter',
  );

  assert.equal(
    resolveProviderApiKey('openrouter', providerKeys),
    'sk-user-openrouter',
  );
});

test('removing a stored provider key falls back to the server key', () => {
  const providerKeys = withStoredProviderApiKey({}, 'openai', 'sk-user-openai');
  const clearedProviderKeys = withoutStoredProviderApiKey(
    providerKeys,
    'openai',
  );

  assert.equal(
    resolveProviderApiKey('openai', clearedProviderKeys),
    'sk-openai-server-test',
  );
});

test('buildCredentialStatusMap marks saved keys and server keys separately', () => {
  const providerKeys = withStoredProviderApiKey(
    {},
    'openrouter',
    'sk-user-openrouter',
  );
  const status = buildCredentialStatusMap(providerKeys);

  assert.deepEqual(status.openai, {
    configured: true,
    source: 'server',
    keyHint: null,
  });
  assert.deepEqual(status.openrouter, {
    configured: true,
    source: 'user',
    keyHint: '••••uter',
  });
});

test('getOpenAiModelCatalog is available when a server key exists', () => {
  const catalog = getOpenAiModelCatalog();

  assert.equal(catalog.available, true);
  assert.equal(catalog.provider, 'openai');
  assert.ok(catalog.models.length > 0);
});
