import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/aiva';
process.env.BETTER_AUTH_SECRET ??= '0123456789abcdef0123456789abcdef';
process.env.BETTER_AUTH_URL ??= 'http://localhost:4112/api/auth';
process.env.WEB_ORIGIN ??= 'http://localhost:3000';
process.env.GOOGLE_CLIENT_ID ??= 'dummy';
process.env.GOOGLE_CLIENT_SECRET ??= 'dummy';

const {
  getPreferredOpenRouterModelId,
  normalizeOpenRouterCatalog,
  toMastraModelId,
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
