# GallopAI v3.3.4 SaveEngine Hotfix

## 修正内容

通常保存とMigrationの両方で、Horseルートドキュメントを`merge`せず完全上書きします。

保存される正式構造:

- raw
- features
- quality
- ocr
- logs
- versions

補助フィールド:

- entityType
- horseKey
- number
- name
- featureCount
- qualitySummary
- ocrSummary
- createdAt
- updatedAt

旧`calculationLog`は保存対象に含めないため、完全上書き時に確実に削除されます。
Horse配下のサブコレクションはドキュメント上書きの影響を受けません。

## 公開後の確認

1. Googleログイン
2. 研究所で「旧データ→v3.3.4移行」を実行
3. 有馬記念を再保存
4. Firestoreの`horses/01`で`calculationLog`が存在しないことを確認
5. `raw / features / quality / ocr / logs / versions`が存在することを確認
