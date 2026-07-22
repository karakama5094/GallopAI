# v3.3.2 マイグレーション

研究所の「旧データ→v3.3.2移行」は各Horseを検査し、次を実行します。

- `raw`、`features`、`quality`、`ocr`、`logs`、`versions`をHorseルートへ統合
- 旧`calculationLog`を`logs.recalculateHistory`へ変換
- 旧`calculationLog`フィールドを削除
- サブコレクションを互換ミラーとして更新
- Raceの`dataModelVersion`を`3.3.2`へ更新
- 移行記録を`metadata/migration`へ保存

移行前に「保存」画面からJSONバックアップを取得してください。
