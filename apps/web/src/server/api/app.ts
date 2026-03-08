import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { appRoutes } from '../routes/app';

export const apiApp = new Hono();

apiApp.route('/api', appRoutes);

apiApp.onError((error, context) => {
  if (error instanceof HTTPException) {
    return context.json({ message: error.message }, error.status);
  }

  console.error(error);
  return context.json({ message: 'Internal Server Error' }, 500);
});
