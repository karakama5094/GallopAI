# GallopAI v3.3.2 公開手順

1. Firebase Console → Firestore → ルールで`firestore.rules`を貼り付け、公開します。
2. ZIPを展開します。
3. 展開した`GallopAI-v3.3.2`フォルダをVercelへデプロイします。
4. 発行された`vercel.app`ドメインをFirebase Authenticationの承認済みドメインへ追加します。
5. Googleログインします。
6. 研究所で「旧データ→v3.3.2移行」を実行します。
7. 続けて「クラウド全件を再集計」を実行します。
8. FirestoreのHorse 01で`raw/features/quality/ocr/logs/versions`を確認します。
