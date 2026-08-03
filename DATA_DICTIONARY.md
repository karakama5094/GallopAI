# GallopAI v3.4.0 データ辞書

## Race
`users/{uid}/races/{raceId}`にレースID、日付、競馬場、レース番号、レース名、馬場、距離、結合件数、データモデル・特徴量バージョンを保存します。Research集計ではFirestoreドキュメントIDをRace IDとして使用します。

## Horse
`users/{uid}/races/{raceId}/horses/{horseId}`のルートは次の6セクションだけをResearch Dashboardの正本として扱います。

- `raw`
- `features`
- `quality`
- `ocr`
- `logs`
- `versions`

セクション欠損時は値を補完せず、部分データ警告へ記録して他Horseの処理を続行します。

## Horse.raw
ソース別の解析結果を保存します。Research Dashboardは結果登録判定もこのセクションだけから行います。

- targetText: TARGET出馬表TXT由来
- trainingPdf: 競馬ブック調教PDF由来
- entryCsv: TARGET出馬表CSV由来
- resultCsv: TARGET結果CSV由来
- merged: 統合前後の照合用馬データ

## Horse.features
実行時の正本は`feature-store.js`の`featureDictionary()`と`FEATURE_SCHEMA_VERSION`です。Phase 1の数値特徴量数は辞書の総項目数ではなく、保存済みHorseで有限なnumberとして実際に観測された一意キー数です。結果由来特徴量は結果登録判定やレース前予測に使用しません。

## Horse.quality
qualityScore、missingCount、duplicateFlag、typeErrorCount、abnormalCount、warning、validationStatus、issuesを保存します。ERRORの場合はクラウド保存を中止します。

## Horse.ocr
confidence、method、engineVersion、parseVersion、pdfPages、timedSessionCount等を保存します。方式は`pdfjs-text-extraction`です。Dashboard表示は0–1を100倍、1超–100をそのまま百分率として平均し、負数・100超・非数値は欠損扱いです。

## Horse.logs / Horse.versions
Feature Version、Engine Version、計算時間、作成・更新日時、再計算履歴を保存します。

Dashboardの`dataModelVersion`は`versions.dataModelVersion`または`versions.horse`、`featureVersion`は`versions.featureVersion`、`versions.features`、`logs.featureVersion`から決定します。複数Versionがある場合は最頻値、同数ならVersion文字列の降順です。データがなければ`No data`です。

## Research Dashboard Phase 1 summary

保存先は既存の`users/{uid}/research/status`を再利用し、Phase 1フィールドをmergeします。`dashboardVersion`は`1.0.0`です。

- `dashboardVersion`
- `dataModelVersion`
- `featureVersion`
- `raceCount`
- `horseCount`
- `resultRegisteredHorseCount`
- `numericFeatureCount`
- `averageQualityScore`
- `averageOcrConfidence`（0–100の百分率）
- `totalMissingCount`
- `warningCount`
- `errorCount`
- `progressTo50`（0–100）
- `generatedAt`
- `calculationTimeMs`
- `sourceRaceIds`
- `warnings`

`generatedAt`はクラウド読込と集計が成功してから生成し、サマリー保存が失敗した場合は画面の最終再計算時刻を更新しません。機械学習データや学習結果は保存しません。
