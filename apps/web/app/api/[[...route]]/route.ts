import { apiApp } from '@/server/api/app';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handle = (request: Request) => {
  return apiApp.fetch(request);
};

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
