# Research Dashboard Phase 1

## 調査結果と実装

調査した main: `1705aaf55f51d32ded81958b5e6e792cb866a31f`。
既存の `buildResearchDashboard`、`recalculateResearchDashboard`、`loadResearchDataset`、`saveResearchDashboardSummary` と Phase 1 画面を再利用する。

対象13項目の集計・表示と loading / empty / error は既存実装済み。今回、再読込後に残る古いサマリー、再集計の重複実行、アカウント変更後の応答反映、警告カウントのみを持つデータの見落としを修正した。

- 集計は保存済み全レース対象。分析フィルターとは独立する。
- 警告数・エラー数は該当馬数。同じ馬の複数指摘を重複計上しない。
- 数値特徴量数は有限な数値が観測されたキーの種類数。
- OCR は既存集計どおり 0–1 / 0–100 を百分率に正規化する。
- Version は既存集計どおり Horse の最頻値を表示する。
- 最終再集計日時はクラウド全件再集計とサマリー保存の成功時に更新する。通常のデータ再読込では古いサマリーを破棄し、日時を未集計として表示する。
- 未ログイン時は端末保存データを集計し、クラウド再集計ボタンを無効化する。
- 長いVersionと日時を折り返す。700px以下では2列にする。

正式6ブロック raw / features / quality / ocr / logs / versions、およびSaveEngineとクラウド保存処理は変更しない。calculationLog・migration・AI学習は追加しない。既存データの削除は行わない。

## 検証

- `node --check app.js`: 成功。
- `node --test --test-reporter=tap`: 全7テストファイル成功。
- 回帰テスト: KPI表示、初期読込、空データ、エラーのエスケープ、再試行、二重実行防止、アカウント変更、端末データへの切替、warningCountのみのデータ。
- Chromiumによる表示検証は実行環境のプロセス制限で起動できず未確認。Windows / iPhone実機と実Firestoreへの接続確認は未実施。

## 手動確認項目

WindowsのEdge/ChromeとiPhoneのSafariで研究所を開き、13項目、長いVersion・日時、再集計中表示、失敗時の再試行、0件、未ログイン表示を確認する。クラウド再集計前後にRace/Horseが変更・削除されていないこと、サマリーのみ更新されることを確認する。
