import { expect, test } from '@rstest/core';
import { RouterProvider } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { router } from '../src/router';

test('renders the main page', async () => {
  globalThis.fetch = async () =>
    new Response('', {
      status: 401,
    });

  await router.navigate({ to: '/' });
  render(<RouterProvider router={router} />);
  expect(
    await screen.findByRole('heading', { level: 1, name: 'Aiva' }),
  ).toBeInTheDocument();
  expect(await screen.findByText('Google でログイン')).toBeInTheDocument();
});
