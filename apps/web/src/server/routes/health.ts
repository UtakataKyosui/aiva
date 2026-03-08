import { Hono } from 'hono';

export const healthRoutes = new Hono().get('/', (context) => {
  return context.json({ ok: true });
});
