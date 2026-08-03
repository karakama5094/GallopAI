# GallopAI v3.4.0

Horse保存構造を正式版へ統一したデータ品質リリースです。Research Dashboard Phase 1のバージョンは`1.0.0`です。

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

SaveEngineはこの6セクションを直接生成・保存し、Research DashboardはHorseルートの正式構造だけを集計します。実行時移行や互換変換は行いません。

## 保存順序

1. raw保存
2. 138項目以上の特徴量生成
3. quality生成
4. ocr生成
5. logs生成
6. Horse保存
7. 研究所統計更新

## Research Dashboard Phase 1

「Recalculate from Cloud」は認証ユーザーの保存済みRaceとHorseを読み、以下を再集計します。

| 指標 | 定義 |
| --- | --- |
| 総保存レース数 | 重複Race IDを除いたRaceドキュメント数 |
| 総保存馬数 | 採用したRace配下の有効なHorseドキュメント数 |
| 結果登録馬数 | `horse.raw`内の結果データに正の整数着順がある馬数 |
| 数値特徴量数 | `horse.features`で1件以上、有限なJavaScript numberを持つ一意キー数 |
| 平均qualityScore | 有限な`horse.quality.qualityScore`の平均。0件なら`No data` |
| 平均OCR confidence | 0–1は100倍、1超–100はそのまま百分率として正規化した平均。範囲外は欠損 |
| missingCount合計 | 有限な`horse.quality.missingCount`の合計 |
| Warning馬数 | Statusが`WARNING`または警告コレクションを持つ馬数 |
| Error馬数 | Statusが`ERROR`または検証Errorを持つ馬数 |
| 50レース進捗 | `raceCount / 50`と100%上限の進捗率 |
| Version | Horseの`versions`と`logs.featureVersion`にある最頻値 |
| 最終再計算 | 集計成功後に生成し、サマリー保存にも成功した時刻 |

欠損canonicalセクション、無効なRace/Horse、重複Race ID、有効な品質/OCR値がない場合は集計を継続し、部分データ警告を表示します。Firestore読込またはサマリー保存が失敗した場合はError状態にし、成功時刻を更新しません。

機械学習は常に無効です。50レース未満は残数を表示し、50レース以上でも別の検証フェーズが完了するまで学習しません。AI学習コントロールは表示しません。

## Firestore

読込先:

- `users/{uid}/races`
- `users/{uid}/races/{raceId}`
- `users/{uid}/races/{raceId}/horses`

既存のResearch summary保存先（Phase 1フィールドをmerge）:

- `users/{uid}/research/status`

すべて既存の`request.auth.uid == userId`ルールで本人だけが読み書きできます。

## 検証

```bash
node --check research-dashboard.js
node --check cloud.js
node --check app.js
node --test research-dashboard.test.js
npm test
```

## Phase 1で変更したファイル

- `research-dashboard.js`
- `cloud.js`
- `app.js`
- `research-dashboard.test.js`
- `styles.css`
- `README.md`
- `DATA_DICTIONARY.md`
