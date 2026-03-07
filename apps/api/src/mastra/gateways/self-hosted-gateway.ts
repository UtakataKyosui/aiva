import { createOpenAICompatible } from '@ai-sdk/openai-compatible-v5';
import type { LanguageModelV2 } from '@ai-sdk/provider-v5';
import { MastraModelGateway, type ProviderConfig } from '@mastra/core/llm';
import {
  getSelfHostedApiKey,
  getSelfHostedBaseUrl,
  getSelfHostedModelCatalog,
  getSelfHostedProviderName,
} from '../../lib/llm.js';

const SELF_HOSTED_PROVIDER_ID = 'local';

export class SelfHostedGateway extends MastraModelGateway {
  readonly id = 'selfhosted';
  readonly name = 'Self Hosted Gateway';

  async fetchProviders(): Promise<Record<string, ProviderConfig>> {
    const baseUrl = getSelfHostedBaseUrl();
    const catalog = baseUrl
      ? await getSelfHostedModelCatalog().catch(() => null)
      : null;

    return {
      [SELF_HOSTED_PROVIDER_ID]: {
        name: getSelfHostedProviderName(),
        models: catalog?.models.map((model) => model.id) ?? [],
        apiKeyEnvVar: 'LOCAL_LLM_API_KEY',
        gateway: this.id,
        url: baseUrl ?? undefined,
      },
    };
  }

  buildUrl(): string {
    const baseUrl = getSelfHostedBaseUrl();

    if (!baseUrl) {
      throw new Error('LOCAL_LLM_BASE_URL is not set.');
    }

    return baseUrl;
  }

  async getApiKey(): Promise<string> {
    return getSelfHostedApiKey();
  }

  resolveLanguageModel({
    modelId,
    providerId,
    apiKey,
  }: {
    modelId: string;
    providerId: string;
    apiKey: string;
  }): LanguageModelV2 {
    const baseURL = this.buildUrl();

    return createOpenAICompatible({
      name: `${this.id}-${providerId}`,
      apiKey,
      baseURL,
    }).chatModel(modelId);
  }
}
