import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { db } from '../db/client';
import { env } from '../env';

const socialProviders =
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        },
      }
    : {};

export const auth = betterAuth({
  appName: 'Aiva',
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: Array.from(
    new Set([
      env.WEB_ORIGIN,
      env.BETTER_AUTH_URL,
      env.BETTER_AUTH_URL.replace(/\/api\/auth\/?$/, ''),
    ]),
  ),
  database: drizzleAdapter(db, {
    provider: 'pg',
  }),
  socialProviders,
  plugins: [nextCookies()],
});
