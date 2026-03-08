import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildConsumedSnapshot,
  computeShortcutNutrition,
  findShortcutStockIssue,
  type ResolvedShortcutItem,
} from './subscription-shortcuts';

const baseItems = (): ResolvedShortcutItem[] => [
  {
    productId: 'product-1',
    serviceId: 'service-1',
    serviceName: 'Base Bread',
    productName: 'BASE BREAD チョコレート',
    quantity: 2,
    stockQuantity: 4,
    stockUnit: '袋',
    calories: 200,
    protein: 13.5,
    fat: 7,
    carbs: 28.3,
  },
  {
    productId: 'product-2',
    serviceId: 'service-2',
    serviceName: 'nosh',
    productName: 'チリハンバーグ',
    quantity: 1,
    stockQuantity: 2,
    stockUnit: '食分',
    calories: 350,
    protein: 20,
    fat: 18,
    carbs: 22,
  },
];

test('computeShortcutNutrition sums item nutrition by quantity', () => {
  const totals = computeShortcutNutrition(baseItems());

  assert.deepEqual(totals, {
    calories: 750,
    protein: 47,
    fat: 32,
    carbs: 78.6,
  });
});

test('findShortcutStockIssue returns the first insufficient item', () => {
  const items = baseItems();
  items[1].stockQuantity = 0;

  assert.deepEqual(findShortcutStockIssue(items), {
    productName: 'チリハンバーグ',
    required: 1,
    available: 0,
  });
});

test('buildConsumedSnapshot keeps item identity and nutrition', () => {
  const snapshot = buildConsumedSnapshot(baseItems());

  assert.equal(snapshot.length, 2);
  assert.deepEqual(snapshot[0], {
    productId: 'product-1',
    serviceId: 'service-1',
    serviceName: 'Base Bread',
    productName: 'BASE BREAD チョコレート',
    quantity: 2,
    stockUnit: '袋',
    calories: 200,
    protein: 13.5,
    fat: 7,
    carbs: 28.3,
  });
});
