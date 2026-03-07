import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import {
  DefaultExporter,
  Observability,
  SensitiveDataFilter,
} from '@mastra/observability';
import { PostgresStore } from '@mastra/pg';
import { env } from '../env.js';
import { mealSuggestionAgent } from './agents/meal-suggestion-agent.js';
import { SelfHostedGateway } from './gateways/self-hosted-gateway.js';
import { dailySuggestionWorkflow } from './workflows/daily-suggestion-workflow.js';

export const mastra = new Mastra({
  agents: { mealSuggestionAgent },
  workflows: { dailySuggestionWorkflow },
  gateways: {
    selfhosted: new SelfHostedGateway(),
  },
  storage: new PostgresStore({
    id: 'aiva-mastra-storage',
    connectionString: env.DATABASE_URL,
  }),
  logger: new PinoLogger({
    name: 'AivaMastra',
    level: 'info',
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'aiva',
        exporters: [new DefaultExporter()],
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
});
