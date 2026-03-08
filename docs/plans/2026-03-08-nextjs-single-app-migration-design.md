# Next.js Single App Migration Design

## Summary

現在の `apps/web` + `apps/api` の 2 サービス構成を、`App Router` ベースの単一 `Next.js` アプリへ統合する。  
最終形では `apps/web` が唯一のアプリケーションになり、UI、認証、Route Handler、Mastra 実行、DB アクセスをこのアプリ内に集約する。  
既存機能はすべて維持する。

対象機能:

- Google ログイン
- 食材 CRUD
- 食事記録 CRUD
- 今日の提案生成
- OpenAI / OpenRouter / local LLM 設定
- 定期便サービス / 商品 / 食事ショートカット
- ショートカット経由の食事記録と在庫減算

非目標:

- 機能削減による段階移行
- Pages Router 採用
- Hono と Next API の併存を長期間続ける構成

## Architecture

推奨方針は、既存 `apps/web` を `Next.js` に置き換え、その中へ `apps/api` の責務を吸収する方法である。  
`packages/shared` は維持し、型と schema の共有境界は残す。

最終構成:

- `apps/web/app/**`
  - App Router の画面と Route Handler
- `apps/web/src/server/**`
  - `db`, `auth`, `domain`, `llm`, `mastra`
- `apps/web/src/components/**`
  - dashboard shell, headbar, sidebar, mobile dock, modal 群
- `packages/shared/**`
  - Zod schema と共有型

最終的に `apps/api` は不要になる。  
移行中は参照元として使うが、Route Handler とサーバーモジュール移設完了後に削除する。

## Routing

### UI Routes

- `/`
- `/suggestion`
- `/ingredients`
- `/meals`
- `/subscriptions`
- `/settings`

`TanStack Router` は撤去し、Next.js の file-based routing に置き換える。  
共通 dashboard shell は `app/(dashboard)/layout.tsx` に集約する。

### API Routes

- `/api/auth/*`
- `/api/ingredients`
- `/api/meals`
- `/api/meals/from-shortcut`
- `/api/subscription-services`
- `/api/subscription-products`
- `/api/meal-shortcuts`
- `/api/preferences`
- `/api/llm-settings`
- `/api/llm-models`
- `/api/suggestions/today`

Route Handler は HTTP の薄い層として扱い、業務ロジックは `src/server/**` へ寄せる。

## Server Migration

### Auth

`Better Auth` は Next.js Route Handler 構成へ移す。  
`app/api/auth/[...all]/route.ts` をエントリにし、既存の `requireSession` 相当は Next の request/cookies 前提で再構成する。

### Database

PostgreSQL + Drizzle は継続する。  
既存 schema, migration, client は `apps/web/src/server/db/**` に移し、DB モデルは変更しない。

### Domain Logic

以下はそのままサーバー層へ移設する。

- suggestion ranking / fallback
- subscription shortcut nutrition / stock check
- LLM catalog / credential resolution

Route Handler 直下には書かない。

### Mastra

Mastra は削除せず、`apps/web/src/server/mastra/**` に移す。  
`POST /api/suggestions/today` の Route Handler から workflow を呼ぶ構成にする。  
Mastra runtime は Node.js runtime 前提で運用する。

## UI Migration

現在の `App.tsx` は責務が集中しているため、Next.js ではページと共通 shell に分割する。

推奨構成:

- `app/layout.tsx`
- `app/(dashboard)/layout.tsx`
- `app/(dashboard)/page.tsx`
- `app/(dashboard)/suggestion/page.tsx`
- `app/(dashboard)/ingredients/page.tsx`
- `app/(dashboard)/meals/page.tsx`
- `app/(dashboard)/subscriptions/page.tsx`
- `app/(dashboard)/settings/page.tsx`

共通 UI コンポーネント:

- `DashboardShell`
- `Headbar`
- `Sidebar`
- `MobileDock`
- `IngredientModal`
- `MealModal`
- `SubscriptionServiceModal`
- `SubscriptionProductModal`
- `MealShortcutModal`

初期移行では全面的な RSC 化を目標にしない。  
全機能維持を優先し、まずは現行の client-side state と fetch ベースの実装を Next.js 上で安定稼働させる。

## Data Flow

初期段階では、既存のフロント API 呼び出しを相対 `/api/*` に切り替える。  
クライアントコンポーネントが Route Handler を呼ぶ構造を維持し、移行リスクを抑える。

その後、必要に応じて server component / server action 化を検討する。  
ただし今回の移行完了条件には含めない。

## Deployment

Leapcell 向けには 2 サービス構成をやめ、最終的に `単一の Next.js サービス` にする。  
このため、以下を満たす必要がある。

- `Next.js` 単体で build / start できる
- Better Auth callback URL は Next アプリの URL を基準に再設定する
- Route Handler 経由で API が完結する

## Risks

主要リスクは次の 3 点。

1. Better Auth の Hono 構成から Next 構成への移行
2. Mastra のサーバー実行環境の移設
3. 単一 `App.tsx` 分割時の状態管理とモーダル連携崩れ

対策:

- Auth / DB / Domain / UI の順に責務を分離して移す
- 先に Route Handler とサーバーモジュールを成立させる
- UI は見た目よりも挙動維持を優先して段階移植する

## Migration Sequence

1. `apps/web` を `Next.js` に置き換える土台を作る
2. dashboard shell と各ページへ UI を分割する
3. `apps/api/src/db`, `auth`, `domain`, `llm`, `mastra` を `apps/web/src/server` へ移す
4. Route Handler を実装して既存 API を順次移植する
5. フロントの API 呼び先を相対 `/api/*` に切り替える
6. Better Auth のログイン / ログアウト / セッション取得を Next 側で通す
7. 提案生成、LLM 切替、定期便、在庫減算を回帰確認する
8. `apps/api` と旧 Rsbuild / TanStack Router 構成を削除する
9. Leapcell を単一 Next.js サービス構成へ更新する

## Test Plan

最低限の受け入れ確認:

- Google ログインが通る
- 食材 CRUD
- 食事記録 CRUD
- 今日の提案生成
- OpenAI / OpenRouter / local LLM 切替
- 定期便サービス / 商品 / ショートカット CRUD
- ショートカット経由の食事記録と在庫減算

開発時の検証:

- `pnpm build`
- `pnpm run test`
- DB migration 適用確認

## Recommendation

移行は `apps/web` を Next.js 化し、`apps/api` の責務を段階的に吸収する方法を採用する。  
これは全機能維持、単一デプロイ、Leapcell への適合性の 3 条件を最も無理なく満たせるためである。
