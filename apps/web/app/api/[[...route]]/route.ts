export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handle = async (request: Request) => {
  const { apiApp } = await import('@/server/api/app');
  return apiApp.fetch(request);
};

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
