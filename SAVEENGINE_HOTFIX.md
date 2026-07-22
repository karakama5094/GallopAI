# GallopAI v3.3.4 SaveEngine

## 保存構造

通常保存はHorseルートドキュメントを`merge`せず完全上書きし、次の6セクションだけを直接保存します。

- raw
- features
- quality
- ocr
- logs
- versions

Firebase / Firestore互換性のため、Horse配下の`raw/current`、`features/current`、`quality/current`、`ocr/current`、`logs/current`サブコレクションも保存します。読み込みはHorseルートの正式構造だけを使用します。

## 公開後の確認

1. Googleログイン
2. 有馬記念を再保存
3. Firestoreの`horses/01`で`raw / features / quality / ocr / logs / versions`だけがHorseルートに存在することを確認
4. クラウド全件を再集計
