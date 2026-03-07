import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { auth } from './auth/config.js';
import { sql } from './db/client.js';
import { env } from './env.js';
import { appRoutes } from './routes/app.js';
import { healthRoutes } from './routes/health.js';

const app = new Hono();

app.use(
  '/api/*',
  cors({
    origin: env.WEB_ORIGIN,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    credentials: true,
  }),
);

app.route('/health', healthRoutes);
app.on(['GET', 'POST', 'OPTIONS'], '/api/auth/*', (context) => auth.handler(context.req.raw));
app.route('/api', appRoutes);

app.onError((error, context) => {
  if (error instanceof HTTPException) {
    return context.json({ message: error.message }, error.status);
  }

  console.error(error);
  return context.json({ message: 'Internal Server Error' }, 500);
});

const server = serve(
  {
    fetch: app.fetch,
    port: env.API_PORT,
  },
  (info) => {
    console.log(`Aiva API is running on http://localhost:${info.port}`);
  },
);

const shutdown = async () => {
  server.close();
  await sql.end();
};

process.on('SIGINT', () => {
  void shutdown();
});

process.on('SIGTERM', () => {
  void shutdown();
});
