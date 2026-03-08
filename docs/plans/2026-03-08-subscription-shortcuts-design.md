# Subscription Meal Shortcuts Design

Date: 2026-03-08

## Summary

食事サブスクで届く商品をユーザーが自分で登録し、それらを複数束ねた食事ショートカットから食事記録を素早く作成できるようにする。

この機能は次を満たす。

- ユーザーが契約中のサブスクサービスを自分で登録できる
- サービス配下に商品を登録できる
- 商品ごとに在庫数と栄養情報を持てる
- 複数商品をまとめた食事ショートカットを作れる
- 食事記録モーダルからショートカットを使って登録できる
- 登録時に在庫不足があれば登録を拒否する
- 登録成功時は食事記録作成と在庫減算を同一処理で行う

## Goals

- Base Bread や nosh のようなサブスク商品をユーザー定義で扱えるようにする
- 日常的な食事登録を 1 タップに近い導線に短縮する
- 栄養情報を記録に残し、今後の提案や振り返りにも使える形にする
- 手動の食事記録と共存できるようにする

## Non-Goals

- 事業者 API との自動連携
- 注文履歴や配送予定の自動取り込み
- サブスク事業者ごとの初期商品カタログ提供
- 通知、再注文、配送管理
- 通常食材とサブスク商品の完全統合在庫モデル
- レシピ機能や汎用献立エンジンへの一般化

## Approaches Considered

### 1. Dedicated service/product/shortcut tables

推奨案。サブスクサービス、商品、ショートカット、ショートカット明細を独立テーブルで持つ。

利点:

- 在庫不足チェックが素直に書ける
- 栄養合算が明確
- 商品を複数ショートカットで再利用できる
- 将来の集計や分析に拡張しやすい

欠点:

- テーブルと UI が増える

### 2. JSON-only shortcut storage

ショートカットの中に商品名、数量、栄養を JSON で直接持たせる案。

利点:

- 実装が軽い

欠点:

- 同じ商品を再利用しにくい
- 在庫連動が崩れやすい
- 編集と整合性維持が難しい

### 3. Generic recipe system

サブスク商品だけでなく通常食材や料理テンプレートまで同じ仕組みに載せる案。

利点:

- 長期的には最も汎用的

欠点:

- v1 としては範囲が広すぎる

## Recommendation

Approach 1 を採用する。今回の要件はサブスク商品の再利用、複数商品の組み合わせ、在庫減算、栄養記録が主目的であり、独立テーブル化が最も一貫している。

## Data Model

### New tables

#### subscription_services

- `id`
- `user_id`
- `name`
- `notes`
- `created_at`
- `updated_at`

ユーザーが契約しているサービス単位。例: `Base Bread`, `nosh`

#### subscription_products

- `id`
- `user_id`
- `service_id`
- `name`
- `sku` nullable
- `stock_quantity`
- `stock_unit`
- `calories` nullable
- `protein` nullable
- `fat` nullable
- `carbs` nullable
- `notes` nullable
- `created_at`
- `updated_at`

サービス配下の商品。例: `BASE BREAD チョコレート`

#### meal_shortcuts

- `id`
- `user_id`
- `service_id` nullable
- `name`
- `notes` nullable
- `created_at`
- `updated_at`

食事登録時に選ぶショートカット本体。サービス横断でも作れるよう `service_id` は nullable にする。

#### meal_shortcut_items

- `id`
- `shortcut_id`
- `product_id`
- `quantity`
- `created_at`
- `updated_at`

ショートカットに含まれる商品と使用数。

### Changes to existing tables

#### meal_logs

以下を追加する。

- `source_type` enum-like text: `manual | shortcut`
- `shortcut_id` nullable
- `calories` nullable
- `protein` nullable
- `fat` nullable
- `carbs` nullable
- `consumed_snapshot` jsonb not null default `[]`

`consumed_snapshot` には、登録時点の商品名、数量、単位、栄養を保存する。元の商品やショートカットが後から編集されても過去ログを壊さないため。

## Shared Contracts

`packages/shared` に以下を追加する。

- `subscriptionServiceInputSchema`
- `subscriptionServiceRecordSchema`
- `subscriptionProductInputSchema`
- `subscriptionProductRecordSchema`
- `mealShortcutInputSchema`
- `mealShortcutRecordSchema`
- `mealShortcutItemInputSchema`
- `mealShortcutPreviewSchema`
- `createMealFromShortcutInputSchema`

`MealLogRecord` には `sourceType`, `shortcutId`, `calories`, `protein`, `fat`, `carbs`, `consumedSnapshot` を追加する。

## API Design

### Services

- `GET /api/subscription-services`
- `POST /api/subscription-services`
- `PATCH /api/subscription-services/:id`
- `DELETE /api/subscription-services/:id`

### Products

- `GET /api/subscription-products`
- `POST /api/subscription-products`
- `PATCH /api/subscription-products/:id`
- `DELETE /api/subscription-products/:id`

### Meal shortcuts

- `GET /api/meal-shortcuts`
- `POST /api/meal-shortcuts`
- `PATCH /api/meal-shortcuts/:id`
- `DELETE /api/meal-shortcuts/:id`

必要なら詳細取得を `GET /api/meal-shortcuts/:id` で分けてもよいが、v1 は一覧に items を含めてもよい。

### Shortcut-based meal registration

- `POST /api/meals/from-shortcut`

Input:

- `shortcutId`
- `consumedOn`
- `mealType`
- `satisfaction` nullable
- `note` nullable

Response:

- 作成済み `MealLogRecord`

## Backend Flow

`POST /api/meals/from-shortcut` はトランザクションで実行する。

1. 対象ショートカットと明細を取得する
2. 参照商品がすべて存在するか確認する
3. 必要数量と現在庫を比較する
4. 1 件でも不足があれば失敗にする
5. 合計栄養を計算する
6. `meal_logs` を `source_type=shortcut` で 1 件作る
7. 各商品の在庫を減算する
8. `consumed_snapshot` に商品名、個数、単位、栄養を保存する

## Validation Rules

- 商品数量は正の数のみ
- ショートカット明細は 1 件以上必須
- 同一ショートカット内に同じ `product_id` を重複登録しない
- `POST /api/meals/from-shortcut` では全商品在庫が足りなければ 400 を返す
- 他ユーザーのサービス、商品、ショートカット参照は常に拒否する

## Error Handling

エラーは具体メッセージを返す。

- `ショートカットに商品が登録されていないため実行できません。`
- `BASE BREAD チョコレートの在庫が不足しています。必要 2 / 現在 1`
- `ショートカット内の商品参照が無効です。`
- `このショートカットは利用できません。`

フロントではモーダルを閉じず、その場に表示する。

## Frontend Design

### New page

TanStack Router に `定期便` ページを追加する。

- `Dashboard`
- `今日の提案`
- `食材`
- `食事`
- `定期便`
- `設定`

### Subscription page sections

#### 1. Services panel

- サービス一覧
- サービス追加モーダル

#### 2. Products panel

- サービスごとの商品一覧
- 商品追加モーダル
- 在庫数、単位、栄養情報を表示

#### 3. Shortcuts panel

- ショートカット一覧
- ショートカット追加モーダル
- 含まれる商品、個数、合計栄養を表示

### Meal modal changes

食事記録モーダルに `通常入力` と `ショートカットから登録` の 2 導線を持たせる。

ショートカット選択時は以下を表示する。

- テンプレート名
- 含まれる商品一覧
- 必要在庫
- 合計栄養
- 不足がある場合の明示的な警告

不足時は送信ボタンを disabled にし、サーバー側でも再チェックする。

## UX Notes

- `Base Bread 2袋 + スープ + プロテイン` のような定型セットを 1 タップ登録に近づける
- 商品編集とショートカット編集はモーダルで行う
- 既存のダッシュボード言語とトーンに合わせる
- モバイルではカードとモーダル中心、PC では 3 カラム寄りの情報整理を行う

## Suggestion System Impact

v1 ではサブスク商品は提案エンジンの優先食材には直接入れない。まずは食事記録の入力高速化と栄養記録の整備を優先する。

ただし、`meal_logs` に合計栄養と `consumed_snapshot` が残るため、将来的に提案ロジックで `最近サブスク中心だった` といった傾向分析へ拡張できる。

## Testing Strategy

### API

- 未認証アクセスは 401
- 他ユーザーのサービス、商品、ショートカットは取得不可
- ショートカット登録時に item が空なら失敗
- `POST /api/meals/from-shortcut` 成功時に meal log と在庫減算が両方反映される
- 在庫不足時に meal log が作られず、在庫も変化しない

### Domain

- 合計栄養が商品数量を考慮して正しく計算される
- 同一商品重複を弾ける
- snapshot が登録時点の値を保存する

### Frontend

- 定期便ページでサービス、商品、ショートカットを作成できる
- 食事記録モーダルでショートカットを選ぶとプレビューが更新される
- 在庫不足時は送信不可になる
- エラー時はモーダル内にメッセージが表示される

## Implementation Notes

実装順は以下を推奨する。

1. shared contract 追加
2. DB schema と migration 追加
3. API route と transaction 実装
4. 定期便ページ UI 追加
5. 食事記録モーダルにショートカット導線追加
6. テスト追加

