# SaveEngine v3.3.4

通常保存は`canonicalHorseDocument()`で正式構造を直接生成します。

Horseルートドキュメントに保存するフィールドは、次の6つだけです。

1. raw
2. features
3. quality
4. ocr
5. logs
6. versions

`batch.set(horseRef, horseDocument)`による完全上書きにより、Horseルートはこの6フィールドだけで構成されます。

Firebase / Firestore互換性維持のため、Horse配下の`raw/current`、`features/current`、
`quality/current`、`ocr/current`、`logs/current`サブコレクションは継続保存します。
