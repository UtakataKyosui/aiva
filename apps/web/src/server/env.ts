import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { z } from 'zod';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = dirname(currentFilePath);
const envCandidates = [
  resolve(currentDirPath, '../../../../.env.local'),
  resolve(currentDirPath, '../../../../.env'),
  resolve(currentDirPath, '../../../.env.local'),
  resolve(currentDirPath, '../../../.env'),
];

for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    config({ path: envPath, override: false });
  }
}

const optionalEnvString = z.preprocess((value) => {
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }

  return value;
}, z.string().min(1).optional());

const defaultOrigin = `http://localhost:${process.env.PORT ?? '3000'}`;

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  OPENAI_API_KEY: optionalEnvString,
  OPENROUTER_API_KEY: optionalEnvString,
  LLM_CREDENTIAL_SECRET: optionalEnvString,
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.preprocess(
    (value) => value ?? `${defaultOrigin}/api/auth`,
    z.string().url(),
  ),
  WEB_ORIGIN: z.preprocess(
    (value) => value ?? defaultOrigin,
    z.string().url(),
  ),
  GOOGLE_CLIENT_ID: optionalEnvString,
  GOOGLE_CLIENT_SECRET: optionalEnvString,
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
});

export const env = envSchema.parse(process.env);
