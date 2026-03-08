# Leapcell Deployment

`Aiva` は Leapcell では `Next.js` 単一 Service としてデプロイします。  
UI、Route Handlers、Better Auth、Mastra はすべて `apps/web` に集約されています。

## 1. PostgreSQL を用意

- Leapcell PostgreSQL を使うか、外部 PostgreSQL を使います
- Service の `DATABASE_URL` に接続文字列を設定します

## 2. Service を作成

- Runtime: `Node.js`
- Repository Root: リポジトリ root
- Build Command:

```bash
npm install -g pnpm@10.30.1 && pnpm install --frozen-lockfile && pnpm run build:web
```

- Start Command:

```bash
pnpm run start:web
```

必要なら deploy 前後に `pnpm db:migrate` を別ジョブで実行してください。アプリ本体は Next.js server として起動します。

### Environment Variables

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
  - 例: `https://aiva-xxxx.leapcell.app/api/auth`
- `WEB_ORIGIN`
  - 例: `https://aiva-xxxx.leapcell.app`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `OPENAI_API_KEY` optional
- `OPENROUTER_API_KEY` optional
- `LLM_CREDENTIAL_SECRET` optional
- `PORT`
  - Leapcell が自動で渡す値をそのまま使います

## 3. Google OAuth の callback / origin を更新

Google Cloud Console 側で以下を許可します。

- Authorized JavaScript origins
  - `https://<service-domain>`
- Authorized redirect URIs
  - `https://<service-domain>/api/auth/callback/google`

## 4. Better Auth の整合

- `BETTER_AUTH_URL=https://<service-domain>/api/auth`
- `WEB_ORIGIN=https://<service-domain>`

## 5. Deploy 後の確認

1. Web を開く
2. Google ログインが動く
3. `GET /health` が `200` を返す
4. 食材登録・食事記録・今日の提案生成が通る
5. `定期便` ページでサービス / 商品 / ショートカット登録が通る

## Notes

- `BETTER_AUTH_URL` と `WEB_ORIGIN` は同じ Service domain を向けます
- `DATABASE_URL` と Google OAuth 設定が正しくないとログインできません
- Leapcell の command 欄には改行を入れず、1 行で貼り付けてください
