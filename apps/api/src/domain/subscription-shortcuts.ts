import type { NutritionTotals } from '@aiva/shared';

export type ResolvedShortcutItem = {
  productId: string;
  serviceId: string | null;
  serviceName: string | null;
  productName: string;
  quantity: number;
  stockQuantity: number;
  stockUnit:
    | 'g'
    | 'kg'
    | 'ml'
    | 'l'
    | '個'
    | '本'
    | '袋'
    | 'パック'
    | '枚'
    | '食分';
  calories: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
};

export type ShortcutStockIssue = {
  productName: string;
  required: number;
  available: number;
};

const roundNutrition = (value: number) => {
  return Math.round(value * 10) / 10;
};

export const computeShortcutNutrition = (
  items: ResolvedShortcutItem[],
): NutritionTotals => {
  return items.reduce<NutritionTotals>(
    (acc, item) => ({
      calories: roundNutrition(
        acc.calories +
          (item.calories === null ? 0 : item.calories * item.quantity),
      ),
      protein: roundNutrition(
        acc.protein +
          (item.protein === null ? 0 : item.protein * item.quantity),
      ),
      fat: roundNutrition(
        acc.fat + (item.fat === null ? 0 : item.fat * item.quantity),
      ),
      carbs: roundNutrition(
        acc.carbs + (item.carbs === null ? 0 : item.carbs * item.quantity),
      ),
    }),
    {
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
    },
  );
};

export const findShortcutStockIssue = (
  items: ResolvedShortcutItem[],
): ShortcutStockIssue | null => {
  for (const item of items) {
    if (item.stockQuantity < item.quantity) {
      return {
        productName: item.productName,
        required: item.quantity,
        available: item.stockQuantity,
      };
    }
  }

  return null;
};

export const buildConsumedSnapshot = (items: ResolvedShortcutItem[]) => {
  return items.map((item) => ({
    productId: item.productId,
    serviceId: item.serviceId,
    serviceName: item.serviceName,
    productName: item.productName,
    quantity: item.quantity,
    stockUnit: item.stockUnit,
    calories: item.calories,
    protein: item.protein,
    fat: item.fat,
    carbs: item.carbs,
  }));
};
