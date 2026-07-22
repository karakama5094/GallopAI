# GallopAI v3.4.0

Horse保存構造を正式版へ統一したデータ品質リリースです。

## Horse正式フィールド

```text
Horse
  raw
  features
  quality
  ocr
  logs
  versions
```

`calculationLog`は`logs.recalculateHistory`へ統合され、移行後は削除されます。

## 保存順序

1. raw保存
2. 138項目以上の特徴量生成
3. quality生成
4. ocr生成
5. logs生成
6. Horse保存
7. 研究所統計更新

## 互換性

Horseルートを正式な参照先とし、v3.3までのサブコレクション `raw/current`、`features/current`、`quality/current`、`ocr/current`、`logs/current` も互換ミラーとして維持します。

## 研究所

- 特徴量統計
- 品質スコア、欠損、重複、警告、エラー集計
- OCR/解析信頼度
- 急加速力帯別成績
- 相関・特徴量ランキング

機械学習は常に無効です。50レースまでは統計検証だけを行います。

## 更新

1. `firestore.rules`を公開
2. Vercelへ`GallopAI-v3.4.0`フォルダをデプロイ
3. 新ドメインをFirebase Authenticationへ追加
4. Googleログイン
5. 研究所の「旧データ→v3.4.0移行」を実行
6. 「クラウド全件を再集計」を実行
