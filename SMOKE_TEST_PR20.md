# PR #20 スモークテスト記録と実機確認手順

対象アプリコミット: `9722de74adae5c0ded4a4c28ae777582ebb957de`。確認日: 2026-11-05。

- PR: https://github.com/karakama5094/GallopAI/pull/20
- Preview: https://gallopai-v334-git-codex-rese-59060a-karakama5094-8853s-projects.vercel.app
- 確認したPreview Deployment: https://vercel.com/karakama5094-8853s-projects/gallopai-v3.3.4/AwRa3XCyNdHsJugUqKdD6APtkZcx

## 実施済み

| 項目 | 結果 |
| --- | --- |
| PRの最新コミット | `9722de7`、open、未マージ、mainとの競合なし |
| Vercel status / Preview Comments | いずれもsuccess |
| GitHub Actions | 対象コミットのworkflow runは0件。テストCI成功とは扱わない |
| Preview HTTP接続 | Vercelログインへリダイレクト。最終HTTP 200はアプリの表示成功ではない |
| 最新コードとの照合 | app / research-dashboard / lifecycle test / cloud / stylesをGitHubと照合。一致（末尾改行を除く） |
| 構文・自動テスト | `node --check app.js` 成功。全102件中101件成功、失敗0件、実PDFフィクスチャが必要な1件をスキップ |
| モックによる動作 | KPI、状態表示、読込・サマリー保存失敗、再試行、重複実行防止、ログイン切替、応答逆転の回帰テスト成功 |
| Firestoreへの操作 | このスモークテストでは接続・読込・書込・削除を実施していない |

## 未確認と判定

Vercelの認証済みセッションがないため、Previewのアプリ画面、デスクトップ/iPhone幅での描画、実Firestore全件集計、実環境での日時更新・再試行・ログイン切替は未確認。アプリのGoogleログイン以前に、VercelのDeployment Protectionで止まっている。保護設定を解除したり認証を迂回したりしていない。

**判定: 実機・実Firestoreの確認が完了するまでマージ保留。** この確認で新しいアプリ不具合は実証されておらず、アプリコードは変更しない。正式6ブロック・SaveEngineは維持。mainへのマージ・本番デプロイは実施しない。

## Windowsでの確認（Edge / Chrome）

1. PRのVercel Previewリンクを開く。Vercelログインが出たら、このプロジェクトにアクセス権のある自分のVercelアカウントでログインする。アクセス権がなければプロジェクト管理者にPreviewアクセスを依頼する。保護設定の変更は不要。
2. VercelのDeployment詳細で対象アプリコミットが `9722de7` またはそれ以降の承認済みコミットであることを確認する。次にアプリ内のGoogleログインを行う。Vercel認証とアプリ認証は別。
3. 「研究所」を開き、読込中表示の後に以下13項目が出ることを確認する。
4. F12 → デバイスツールバー（Ctrl+Shift+M）で幅320 / 375 / 390 / 768 / 1366pxを順に確認する。700px以下ではKPIが2列になり、長いVersion・日時がカード内で折り返されること、再集計ボタンが操作できることを確認する。
5. 任意でConsoleに `document.documentElement.scrollWidth <= window.innerWidth` を入力する。trueが期待値。falseなら画面幅と横にはみ出している要素を記録する。

| # | 表示項目 | 照合の要点 |
| --- | --- | --- |
| 1 | 総保存レース数 | 重複しないRace ID数 |
| 2 | 総保存馬数 | 全レースの有効Horse数 |
| 3 | 結果登録馬数 | raw内の有効な確定着順を持つ馬数 |
| 4 | 数値特徴量数 | 有限な数値がある特徴量キーの種類数 |
| 5 | 平均qualityScore | 有効値の平均、小数1桁 |
| 6 | 平均OCR confidence | 0–1 / 0–100を百分率に正規化した平均、小数1桁 |
| 7 | missingCount合計 | Horseの欠損数の合計 |
| 8 | Warning馬数 | 警告がある馬を1頭1回で計上 |
| 9 | Error馬数 | エラーがある馬を1頭1回で計上 |
| 10 | 50レース進捗 | レース数/50、百分率上限100% |
| 11 | dataModelVersion | Horseの最頻Version。未登録はNo data |
| 12 | featureVersion | Horseの最頻Version。未登録はNo data |
| 13 | 最終再計算時刻 | 全件再集計とサマリー保存の成功時刻 |

### 全件集計の照合と書込範囲

他の端末で保存データを変更していない時間帯に行う。取込・保存・同期・削除ボタンは操作しない。自動の初回再集計も既存の研究サマリーを更新する。

WindowsのPreviewを開いたConsoleで、次のコードを実行すると、アプリが利用する既存データの**読込のみ**を行い、期待値を表示できる。Firestoreに書き込むコードではない。

```js
const smokeCloud = await import('/cloud.js');
const smokeDashboard = await import('/research-dashboard.js');
const smokeBefore = await smokeCloud.loadResearchDataset();
const smokeExpected = smokeDashboard.buildResearchDashboard(smokeBefore);
console.table(Object.fromEntries([
  'raceCount', 'horseCount', 'resultRegisteredHorseCount',
  'numericFeatureCount', 'averageQualityScore', 'averageOcrConfidence',
  'totalMissingCount', 'warningCount', 'errorCount', 'progressTo50',
  'dataModelVersion', 'featureVersion'
].map(key => [key, smokeExpected[key]])));
```

画面と表の12項目を照合する（平均値は画面の小数1桁丸めを考慮）。これは全件取得・画面の連携を確認するもので、集計関数そのものの独立検算ではない。関数の境界値・定義は自動テストで検証している。

続いて「クラウド全件を再集計」を1回押す。読込中表示の後に値が変わらず、最終再計算時刻が更新されることを確認する。Firestore Consoleで、自分の `users/{uid}/research/status` の `generatedAt` と画面の日時が一致することを確認する（表示時刻は端末タイムゾーン）。サマリー更新以外を手動編集しない。

再集計後、同じConsoleで以下を実行する。trueが期待値。他の端末が同時にデータを更新した場合は、その影響を分けて調べる。

```js
const smokeAfter = await smokeCloud.loadResearchDataset();
console.log('Race/Horse読込値が再集計前後で同一:',
  JSON.stringify(smokeBefore) === JSON.stringify(smokeAfter));
```

## 状態表示・失敗・ログイン切替

| ケース | 操作 | 期待値・記録 |
| --- | --- | --- |
| 未ログイン | アプリ内でログアウトして研究所を開く | 端末データ表示の説明、クラウド再集計ボタン無効化。端末データが0件なら空表示 |
| クラウド0件 | 既存のデータ未登録テストアカウントがあれば切り替える | 件数0、平均/VersionはNo data、空データ表示。検証目的で既存データを削除しない |
| 読込中・重複操作 | DevTools NetworkをSlow 3Gにして再集計、戻して復帰 | 読込中表示になりボタンが消える。二重実行されない |
| 通信障害 | Windows DevTools NetworkをOfflineにして再集計を試す。観察後はOnlineに戻す | 実際にSDKが失敗を返したらエラーと再試行が出ることを確認。Firestore SDKが再接続/書込を待つ場合もあるため、Offlineだけで即エラーになるとは扱わない。60秒以上待機のままなら未確認として時間・Consoleエラーを記録する |
| 権限エラー | 既存の権限不足テストアカウントがある場合だけ使用 | 読込/サマリー書込失敗がエラー表示となり、読込中に固定されない。権限ルールは変更しない |
| 復帰・再試行 | 通信またはアクセス権が回復した状態で再試行 | 成功表示に戻る。サマリー保存成功後だけ最終日時が更新される |
| ログアウト中の応答 | Slow 3Gで再集計開始 → ヘッダーからログアウト → 通信復帰 | 前アカウントの遅い応答がKPIやエラーを上書きしない |
| アカウント切替 | 上記後、別の既存テストアカウントでログイン | 別アカウントのデータだけ表示。同じアカウントへの再ログインも確認 |

サマリー保存が通信待ちの場合、オンライン復帰後に元アカウントのサマリー書込が完了することはある。認証切替後の画面に元アカウントの結果が反映されないことと、別アカウントへ書き込まれないことを確認する。確実な書込拒否を再現できない場合は、保存失敗経路を実機確認済みとしない。

## iPhone Safariでの確認

1. Safariで同じPreviewリンクを開き、Vercel認証とアプリのGoogle認証を行う。アプリ内ブラウザーは使わない。
2. 研究所を開き、13項目を縦スクロールで確認。縦向き・横向きで、カードの重なり、横はみ出し、長いVersion/日時の欠けがないことを確認する。
3. 「クラウド全件を再集計」を押し、指で押しやすいこと、読込中→成功と日時更新を確認する。
4. 再集計中のログアウトと再ログインを確認し、前アカウントの値が残らないことを確認する。通信や権限エラーを安全に再現できなければ、その項目は未確認のまま記録する。

## 結果記入テンプレート

```text
端末 / OS / ブラウザー:
確認したコミット / 日時:
Vercel認証 / アプリ認証: OK / NG
13項目・集計値: OK / NG / 未確認
横はみ出し・操作性（画面幅または縦横）: OK / NG
再集計・日時更新: OK / NG
空データ / 未ログイン: OK / NG / 未確認
読込失敗 / 保存失敗 / 再試行: OK / NG / 未確認
ログアウト / 別アカウント / 同一アカウント再ログイン: OK / NG / 未確認
Race/Horse前後同一・研究サマリーのみ更新: OK / NG / 未確認
Consoleエラー・不具合と再現手順:
```

実機の未確認項目が残る間は、プレビューのReadyや自動テスト成功だけでスモークテスト合格・マージ可能とは判断しない。
