import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { z } from 'zod';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = dirname(currentFilePath);
const workspaceRootEnvPath = resolve(currentDirPath, '../../../.env');
const packageEnvPath = resolve(currentDirPath, '../.env');

config({
  path: existsSync(workspaceRootEnvPath)
    ? workspaceRootEnvPath
    : packageEnvPath,
});

const optionalEnvString = z.preprocess((value) => {
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }

  return value;
}, z.string().min(1).optional());

const envSchema = z.object({
  API_PORT: z.preprocess(
    (value) => value ?? process.env.PORT,
    z.coerce.number().default(4112),
  ),
  DATABASE_URL: z.string().min(1),
  OPENAI_API_KEY: optionalEnvString,
  OPENROUTER_API_KEY: optionalEnvString,
  LLM_CREDENTIAL_SECRET: optionalEnvString,
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.string().url(),
  WEB_ORIGIN: z.string().url(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
});

export const env = envSchema.parse(process.env);
