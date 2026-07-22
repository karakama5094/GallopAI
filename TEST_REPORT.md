# GallopAI v3.4.0 テスト項目

## 静的検証
- JavaScript構文
- Horse正式フィールド6項目
- Horse正式フィールド6項目のみの保存
- quality/OCR統計集計
- AI学習無効

## 実機検証
1. Googleログイン
2. 有馬記念サンプルをクラウド保存
3. Horse 01を開く
4. `raw/features/quality/ocr/logs/versions`が存在することを確認
5. クラウド全件再集計
6. 研究所に品質とOCR集計が表示されることを確認

機械学習は50レース未満・以上を問わず本版では無効です。
