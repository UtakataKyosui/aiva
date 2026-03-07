import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { auth } from './config.js';

export const requireSession = async (context: Context) => {
  const session = await auth.api.getSession({
    headers: context.req.raw.headers,
  });

  if (!session?.user) {
    throw new HTTPException(401, { message: 'Unauthorized' });
  }

  return session;
};
