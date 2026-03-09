export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const getAuthHandler = async () => {
  const [{ toNextJsHandler }, { auth }] = await Promise.all([
    import('better-auth/next-js'),
    import('@/server/auth/config'),
  ]);

  return toNextJsHandler(auth);
};

export const GET = async (request: Request) =>
  (await getAuthHandler()).GET(request);

export const POST = async (request: Request) =>
  (await getAuthHandler()).POST(request);

export const PATCH = async (request: Request) =>
  (await getAuthHandler()).PATCH(request);

export const PUT = async (request: Request) =>
  (await getAuthHandler()).PUT(request);

export const DELETE = async (request: Request) =>
  (await getAuthHandler()).DELETE(request);
