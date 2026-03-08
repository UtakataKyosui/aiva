# Leapcell Deployment

`Aiva` は Leapcell では `web` と `api` を別 Service としてデプロイするのが自然です。  
このリポジトリにはそのまま使える build/start script を追加してあります。

## 1. PostgreSQL を用意

- Leapcell PostgreSQL を使うか、外部 PostgreSQL を使います
- API Service の `DATABASE_URL` に接続文字列を設定します

## 2. API Service を作成

- Runtime: `Node.js`
- Repository Root: リポジトリ root
- Build Command:

```bash
corepack enable && pnpm install --frozen-lockfile && pnpm run build:api
```

- Start Command:

```bash
pnpm run start:api
```

`start:api` は起動前に `node dist/db/migrate.js` を実行するので、初回 deploy 時も migration 漏れを避けられます。

### API Environment Variables

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
  - 例: `https://aiva-api-xxxx.leapcell.app/api/auth`
- `WEB_ORIGIN`
  - 例: `https://aiva-web-xxxx.leapcell.app`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `OPENAI_API_KEY` optional
- `OPENROUTER_API_KEY` optional
- `LLM_CREDENTIAL_SECRET` optional

`API_PORT` は不要です。Leapcell が `PORT` を渡した場合はそれを優先して待ち受けます。

## 3. Web Service を作成

- Runtime: `Node.js`
- Repository Root: リポジトリ root
- Build Command:

```bash
corepack enable && pnpm install --frozen-lockfile && pnpm run build:web
```

- Start Command:

```bash
pnpm run start:web
```

### Web Environment Variables

- `PUBLIC_API_BASE_URL`
  - 例: `https://aiva-api-xxxx.leapcell.app`

`start:web` は `rsbuild preview --host 0.0.0.0 --port ${PORT:-3000}` で動きます。

## 4. Google OAuth の callback / origin を更新

Google Cloud Console 側で以下を許可します。

- Authorized JavaScript origins
  - Web Service URL
- Authorized redirect URIs
  - `https://<api-service-domain>/api/auth/callback/google`

## 5. Better Auth / CORS の整合

API 側で最低限この組み合わせにします。

- `BETTER_AUTH_URL=https://<api-domain>/api/auth`
- `WEB_ORIGIN=https://<web-domain>`

Web 側は:

- `PUBLIC_API_BASE_URL=https://<api-domain>`

## 6. Deploy 後の確認

1. Web を開く
2. Google ログインが動く
3. `GET /health` が `200` を返す
4. 食材登録・食事記録・今日の提案生成が通る
5. `定期便` ページでサービス / 商品 / ショートカット登録が通る

## Notes

- API と Web は別 Service なので、環境変数の URL は相互に正しく向ける必要があります
- 初回 deploy では API が DB migration を実行するため、DB 接続に失敗すると起動しません
- `PUBLIC_API_BASE_URL` はビルド時に埋め込まれるので、Web Service 側で必ず設定してください
