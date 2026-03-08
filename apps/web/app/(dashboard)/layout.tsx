'use client';

import type { ReactNode } from 'react';
import App from '@/App';

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <App />
      {children}
    </>
  );
}
