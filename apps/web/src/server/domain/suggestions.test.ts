import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRecentPattern,
  createFallbackSuggestion,
  isFallbackSuggestionResult,
  rankIngredients,
} from './suggestions';

test('rankIngredients prioritizes items close to expiry', () => {
  const ranked = rankIngredients({
    suggestionDate: '2026-03-08',
    ingredients: [
      {
        id: 'a',
        name: 'キャベツ',
        category: '野菜',
        quantity: 1,
        unit: '個',
        expiresOn: '2026-03-08',
      },
      {
        id: 'b',
        name: '米',
        category: '穀物',
        quantity: 2,
        unit: 'kg',
        expiresOn: null,
      },
    ],
    meals: [],
    preferences: null,
  });

  assert.equal(ranked[0]?.name, 'キャベツ');
});

test('buildRecentPattern detects carb-heavy history', () => {
  const pattern = buildRecentPattern([
    {
      id: '1',
      consumedOn: '2026-03-06',
      mealType: '夕食',
      menuName: 'カレー',
      satisfaction: 4,
    },
    {
      id: '2',
      consumedOn: '2026-03-07',
      mealType: '昼食',
      menuName: 'パスタ',
      satisfaction: 3,
    },
    {
      id: '3',
      consumedOn: '2026-03-08',
      mealType: '夕食',
      menuName: '丼',
      satisfaction: 3,
    },
  ]);

  assert.match(pattern, /炭水化物中心/);
});

test('fallback suggestion avoids empty response', () => {
  const response = createFallbackSuggestion(
    {
      suggestionDate: '2026-03-08',
      ingredients: [],
      meals: [],
      preferences: {
        allergies: ['えび'],
        dislikes: ['パクチー'],
        notes: [],
      },
    },
    [],
  );

  assert.equal(response.meals.length, 1);
  assert.match(response.note, /簡易提案/);
});

test('isFallbackSuggestionResult detects legacy saved fallback payloads', () => {
  const response = createFallbackSuggestion(
    {
      suggestionDate: '2026-03-08',
      ingredients: [],
      meals: [],
      preferences: null,
    },
    [],
    'Incorrect API key',
  );

  assert.equal(isFallbackSuggestionResult(response), true);
  assert.equal(
    isFallbackSuggestionResult({
      ...response,
      note: '通常の提案メモです。',
    }),
    false,
  );
});
