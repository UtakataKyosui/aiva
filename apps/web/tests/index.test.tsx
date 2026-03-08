import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDashboardView } from '../src/dashboard-routes';

test('resolves the overview route from the root path', () => {
  assert.equal(resolveDashboardView('/'), 'overview');
});

test('resolves each dashboard child route', () => {
  assert.equal(resolveDashboardView('/suggestion'), 'suggestion');
  assert.equal(resolveDashboardView('/ingredients'), 'ingredients');
  assert.equal(resolveDashboardView('/meals'), 'meals');
  assert.equal(resolveDashboardView('/subscriptions'), 'subscriptions');
  assert.equal(resolveDashboardView('/settings'), 'settings');
});
