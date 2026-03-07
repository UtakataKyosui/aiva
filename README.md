# Aiva

Mastra を使って「登録済みの食材」「最近の食事記録」「個人条件」から当日の食事サジェストを生成する生活支援アプリです。

## Workspace

- `apps/web`: React + Rsbuild の日本語フロントエンド
- `apps/api`: Hono + Better Auth + PostgreSQL + Mastra API
- `packages/shared`: Zod スキーマと共有型
- `packages/config`: 共有設定

`pnpm workspace` と `moonrepo` でタスクを管理します。

## Setup

1. 依存関係をインストール

```bash
pnpm install
```

2. 環境変数を用意

```bash
cp .env.example .env
```

3. PostgreSQL を起動

```bash
pnpm db:up
```

4. Better Auth の schema を生成

```bash
pnpm --filter @aiva/api db:generate-auth
```

5. Drizzle マイグレーションを生成して適用

```bash
pnpm --filter @aiva/api db:generate
pnpm db:migrate
```

6. Web / API を同時起動

```bash
pnpm dev
```

## Ports

- Web: `http://localhost:3000`
- API: `http://localhost:4112`
- Better Auth base URL: `http://localhost:4112/api/auth`

## Commands

```bash
pnpm dev
pnpm build
pnpm test
pnpm lint
pnpm format
pnpm db:up
pnpm db:down
pnpm db:migrate
pnpm db:studio
```
