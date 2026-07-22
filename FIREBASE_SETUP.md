# Firebase設定（GallopAI v3.3.2）

既存のFirebaseプロジェクトを継続利用できます。

1. AuthenticationでGoogleを有効化
2. Vercelの新しい`vercel.app`ドメインを承認済みドメインへ追加
3. FirestoreのルールへZIP内の`firestore.rules`を貼り付けて公開
4. Vercelへフォルダをデプロイ

ルールは、ログイン本人の`users/{uid}`配下のみを読み書き可能にします。Horse配下のraw/features/quality/ocr/logsと、研究所のグローバル統計を含みます。
