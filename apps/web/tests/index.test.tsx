import { expect, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import App from '../src/App';

test('renders the main page', async () => {
  globalThis.fetch = async () =>
    new Response('', {
      status: 401,
    });

  render(<App />);
  expect(await screen.findByText('Aiva')).toBeInTheDocument();
  expect(await screen.findByText('Google でログイン')).toBeInTheDocument();
});
