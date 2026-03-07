# Aiva

Mastra を使って「登録済みの食材」「最近の食事記録」「個人条件」から当日の食事サジェストを生成する生活支援アプリです。  
Google ログイン後、ユーザーごとに `OpenAI` / `OpenRouter` / ローカルまたは自己ホストの `OpenAI-compatible` LLM を切り替えて提案生成に使えます。

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

`OPENAI_API_KEY` と `OPENROUTER_API_KEY` は両対応です。どちらか片方だけでも起動できます。  
ローカル LLM を使う場合は `LOCAL_LLM_BASE_URL` に OpenAI-compatible エンドポイントを指定してください。既定値は Ollama の `http://127.0.0.1:11434/v1` です。`LOCAL_LLM_API_KEY` は未設定でも動きますが、OpenAI 互換クライアント用に既定で `ollama` を使います。

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

7. ログイン後に `AI設定` セクションから provider と model を保存

- `OpenAI`: アプリ内の固定候補から選択
- `OpenRouter`: サーバー側の `OPENROUTER_API_KEY` を使って取得したモデル一覧から選択
- `ローカル / サーバ LLM`: `LOCAL_LLM_BASE_URL` の `/models` から取得したモデル一覧から選択

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
