# GallopAI v3.4.0 データ辞書

## Race
レースID、日付、競馬場、レース番号、レース名、馬場、距離、結合件数、データモデル・特徴量バージョンを保存します。

## Horse
一覧表示とv3.2互換のため、馬番・馬名・枠・基本情報・能力・調教・結果の要約を保持します。

## raw/current
ソース別の解析結果を保存します。

- targetText: TARGET出馬表TXT由来
- trainingPdf: 競馬ブック調教PDF由来
- entryCsv: TARGET出馬表CSV由来
- resultCsv: TARGET結果CSV由来
- merged: 統合前後の照合用馬データ

## features/current
`feature_dictionary.json`で定義する240特徴量を保存します。結果由来の特徴量には`POST_RACE_ONLY`を付与し、予測時のデータ漏洩を防ぎます。

## quality/current
qualityScore、missingCount、duplicateFlag、typeErrorCount、abnormalCount、warning、validationStatus、issuesを保存します。ERRORの場合はクラウド保存を中止します。

## ocr/current
confidence、method、engineVersion、parseVersion、pdfPages、timedSessionCount等を保存します。方式は`pdfjs-text-extraction`です。

## logs
Feature Version、Engine Version、計算時間、作成・更新日時、再計算履歴を保存します。
