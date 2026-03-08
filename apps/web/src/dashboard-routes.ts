export type DashboardView =
  | 'overview'
  | 'suggestion'
  | 'ingredients'
  | 'meals'
  | 'subscriptions'
  | 'settings';

export const dashboardViewMeta: Record<
  DashboardView,
  { eyebrow: string; title: string; description: string }
> = {
  overview: {
    eyebrow: 'Daily Control Center',
    title: 'Dashboard',
    description:
      '今日の提案、在庫の鮮度、最近の食事傾向を 1 画面で確認し、次の操作へすぐ移れます。',
  },
  suggestion: {
    eyebrow: "Today's Suggestion",
    title: '献立プランナー',
    description:
      'Mastra の提案結果を集中して確認し、優先消費すべき食材と採用理由を追えます。',
  },
  ingredients: {
    eyebrow: 'Inventory',
    title: '食材ストック',
    description:
      '食材の登録と編集はモーダルで行い、一覧から期限の近い在庫をすぐに見つけられます。',
  },
  meals: {
    eyebrow: 'Meal History',
    title: '食事タイムライン',
    description:
      '最近の食事記録と満足度を整理し、偏りや続いているパターンを把握します。',
  },
  subscriptions: {
    eyebrow: 'Subscription Pantry',
    title: '定期便ストック',
    description:
      '契約中のサービス、届く商品、食事ショートカットをまとめて管理し、記録を短縮します。',
  },
  settings: {
    eyebrow: 'Preferences & AI',
    title: '設定と条件',
    description:
      'アレルギー、苦手食材、使用する LLM をまとめて管理し、提案の前提を調整します。',
  },
};

export const dashboardRoutePaths: Record<DashboardView, string> = {
  overview: '/',
  suggestion: '/suggestion',
  ingredients: '/ingredients',
  meals: '/meals',
  subscriptions: '/subscriptions',
  settings: '/settings',
};

export const resolveDashboardView = (pathname: string): DashboardView => {
  switch (pathname) {
    case dashboardRoutePaths.suggestion:
      return 'suggestion';
    case dashboardRoutePaths.ingredients:
      return 'ingredients';
    case dashboardRoutePaths.meals:
      return 'meals';
    case dashboardRoutePaths.subscriptions:
      return 'subscriptions';
    case dashboardRoutePaths.settings:
      return 'settings';
    default:
      return 'overview';
  }
};
