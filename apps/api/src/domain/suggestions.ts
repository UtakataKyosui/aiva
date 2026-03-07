import {
  dailySuggestionResponseSchema,
  suggestionMealSchema,
  type UserLlmSettingsInput,
} from '@aiva/shared';
import { z } from 'zod';
import { daysUntil } from '../lib/date.js';

export type IngredientRow = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  expiresOn: string | null;
};

export type MealLogRow = {
  id: string;
  consumedOn: string;
  mealType: string;
  menuName: string;
  satisfaction: number | null;
};

export type PreferenceRow = {
  allergies: string[];
  dislikes: string[];
  note: string | null;
} | null;

export type SuggestionContext = {
  suggestionDate: string;
  ingredients: IngredientRow[];
  meals: MealLogRow[];
  preferences: PreferenceRow;
  llm?: UserLlmSettingsInput | null;
};

export const generatedMealPlanSchema = z.object({
  meals: z.array(suggestionMealSchema).min(1).max(3),
  note: z.string().min(1),
});

type PrioritizedIngredient = z.infer<typeof dailySuggestionResponseSchema.shape.priorities>[number];

const mealKeywords = {
  野菜: ['サラダ', '野菜', '炒め', 'スープ', '煮物'],
  肉: ['肉', 'チキン', '豚', '牛', 'ハンバーグ', '唐揚げ'],
  魚: ['魚', '鮭', 'サバ', '刺身', '焼き魚'],
  穀物: ['ご飯', '丼', 'パスタ', 'パン', '麺', 'うどん'],
} as const;

const categoryFocusBonus = (category: string, meals: MealLogRow[]) => {
  const keywords = mealKeywords[category as keyof typeof mealKeywords];
  if (!keywords?.length) {
    return 0;
  }

  const recentMatches = meals.filter((meal) =>
    keywords.some((keyword) => meal.menuName.includes(keyword)),
  ).length;

  return recentMatches === 0 ? 12 : recentMatches === 1 ? 6 : 0;
};

const expiryUrgencyScore = (expiresOn: string | null) => {
  const days = daysUntil(expiresOn);

  if (days === null) {
    return 15;
  }

  if (days < 0) {
    return 120;
  }

  if (days === 0) {
    return 100;
  }

  if (days === 1) {
    return 90;
  }

  if (days <= 3) {
    return 70;
  }

  if (days <= 7) {
    return 40;
  }

  return 20;
};

const expiryReason = (expiresOn: string | null) => {
  const days = daysUntil(expiresOn);

  if (days === null) {
    return '在庫はあるが期限情報が未登録です。';
  }

  if (days < 0) {
    return '期限切れの可能性があるため、状態確認を優先してください。';
  }

  if (days === 0) {
    return '今日が消費期限です。';
  }

  if (days === 1) {
    return '明日までに使い切りたい食材です。';
  }

  if (days <= 3) {
    return `${days}日以内に使いたい食材です。`;
  }

  return '直近の食事バランスを整える候補です。';
};

export const buildRecentPattern = (meals: MealLogRow[]) => {
  if (!meals.length) {
    return '食事記録がまだ少ないため、まずは在庫優先で提案します。';
  }

  const mealTypeCounts = meals.reduce<Record<string, number>>((acc, meal) => {
    acc[meal.mealType] = (acc[meal.mealType] ?? 0) + 1;
    return acc;
  }, {});

  const topMealType = Object.entries(mealTypeCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const averageSatisfaction =
    meals.filter((meal) => meal.satisfaction !== null).reduce((acc, meal) => acc + (meal.satisfaction ?? 0), 0) /
      Math.max(
        1,
        meals.filter((meal) => meal.satisfaction !== null).length,
      );

  const highCarbBias = meals.filter((meal) =>
    ['丼', '麺', 'パスタ', 'カレー', 'パン', 'チャーハン'].some((keyword) =>
      meal.menuName.includes(keyword),
    ),
  ).length;

  if (highCarbBias >= 3) {
    return `最近は炭水化物中心の記録が多めです。${topMealType ?? '主食'}に偏りすぎないよう、野菜やたんぱく源を補う提案を優先します。`;
  }

  if (averageSatisfaction > 0 && averageSatisfaction < 3) {
    return '直近の満足度がやや低いため、食べやすさと満足感を両立しやすい献立を優先します。';
  }

  return `最近は${topMealType ?? '夕食'}の記録が中心です。期限が近い食材を使いながら、単調になりにくい提案を返します。`;
};

export const rankIngredients = ({ ingredients, meals }: SuggestionContext) => {
  const priorities = ingredients
    .map((ingredient) => {
      const urgencyScore =
        expiryUrgencyScore(ingredient.expiresOn) + categoryFocusBonus(ingredient.category, meals);

      const reason = expiryReason(ingredient.expiresOn);

      return {
        ingredientId: ingredient.id,
        name: ingredient.name,
        reason,
        urgencyScore,
      } satisfies PrioritizedIngredient;
    })
    .sort((a, b) => b.urgencyScore - a.urgencyScore)
    .slice(0, 5);

  return priorities;
};

export const buildSuggestionPrompt = (context: SuggestionContext, priorities: PrioritizedIngredient[]) => {
  const recentPattern = buildRecentPattern(context.meals);
  const constraints = {
    allergies: context.preferences?.allergies ?? [],
    dislikes: context.preferences?.dislikes ?? [],
    note: context.preferences?.note ?? '',
  };

  const prompt = `
あなたは日本語で献立提案を行う生活支援アシスタントです。
今日の日付は ${context.suggestionDate} です。

守る条件:
- 期限が近い食材を優先する
- アレルギー・苦手食材は絶対に使わない
- 食事記録の傾向に被りすぎない
- 調理負荷は平日でも実行しやすい現実的な範囲にする
- 返答は JSON を意識した簡潔な日本語にする

最近の傾向:
${recentPattern}

優先食材:
${JSON.stringify(priorities, null, 2)}

在庫一覧:
${JSON.stringify(context.ingredients, null, 2)}

個人条件:
${JSON.stringify(constraints, null, 2)}
`;

  return {
    prompt,
    recentPattern,
  };
};

export const createFallbackSuggestion = (
  context: SuggestionContext,
  priorities: PrioritizedIngredient[],
  fallbackReason?: string,
) => {
  const recentPattern = buildRecentPattern(context.meals);

  return dailySuggestionResponseSchema.parse({
    suggestionDate: context.suggestionDate,
    generatedAt: new Date().toISOString(),
    llm: context.llm ?? null,
    priorities,
    recentPattern,
    meals: priorities.length
      ? [
          {
            title: `${priorities[0]?.name ?? '在庫食材'}を使ったシンプル献立`,
            summary:
              '期限が近い食材を優先して、主菜1品と副菜1品でまとめる構成です。',
            whyItFits: [
              priorities[0]?.reason ?? '在庫消化を優先します。',
              '最近の食事傾向と重なりすぎない軽めの構成です。',
            ],
            cautions: [
              ...(context.preferences?.allergies.length
                ? [`アレルギー対象: ${context.preferences.allergies.join('、')} を避けてください。`]
                : []),
            ],
          },
        ]
      : [
          {
            title: '在庫補充を前提にした軽食提案',
            summary:
              '記録された在庫が少ないため、たんぱく質と野菜を足せる簡単な食事を推奨します。',
            whyItFits: ['食材不足時でも実行しやすい構成です。'],
            cautions: ['不足食材の補充も検討してください。'],
          },
        ],
    note:
      fallbackReason
        ? `AI 提案を取得できなかったため、在庫と履歴ルールに基づく簡易提案を表示しています。(${fallbackReason})`
        : 'AI 提案を取得できなかったため、在庫と履歴ルールに基づく簡易提案を表示しています。',
  });
};
