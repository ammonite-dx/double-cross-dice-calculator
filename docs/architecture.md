# アーキテクチャ

このアプリはCloudflare Pagesで配信する静的SPAです。サーバー側の計算やデータベースを
必要とせず、事前計算済み確率分布の取得と追加計算をブラウザ内で行います。

## モジュール境界

- `ScoreCalculator.js`: 一般判定・対決判定の達成値と成功率
- `DamageCalculator.js`: ダメージ、期待値、複数コンボの合計
- `BacktrackCalculator.js`: バックトラック後の侵蝕率
- `Distribution.js`: 疎な分布の展開、期待値、上側確率などの共通処理
- `FFT.js`: 独立な確率分布の加算・減算
- `PrecomputedDataRepository.js`: 静的アセットの取得、検証、キャッシュ

Vueコンポーネントは入力状態と表示を管理し、確率計算そのものは上記モジュールへ委譲します。
計算モジュールはVueに依存しません。

## データフロー

```text
route guard / input watcher
          |
          v
PrecomputedDataRepository
  fetch -> validate -> cache -> sparse expansion
          |
          v
Score / Damage / Backtrack Calculator
          |
          v
reactive view state -> Chart.js
```

ルート表示前に初期値で必要なアセットを読み込みます。`shihai`や`kazanari`が変わった場合は
対応する分割ファイルだけを追加取得します。連続した入力変更ではリビジョン番号を使い、
古い非同期計算結果で新しい入力結果を上書きしないようにします。

## 事前計算データ

事前計算データは`public/data/schema-v{schemaVersion}/revision-{dataRevision}/`に配置し、
アプリ本体と同じデプロイから配信します。ファイル名に内容ハッシュは付けず、変更時は
`dataRevision`を更新します。同一リビジョンのファイルは変更せず、長期キャッシュの対象に
します。

詳しいスキーマと更新手順は[`precomputed-data.md`](./precomputed-data.md)を参照してください。

## 旧実装との比較

分離前の計算実装は`tests/legacy/LegacyCalculator.js`に回帰比較専用で残しています。
本番コードから参照してはいけません。移行テストは新旧の結果を完全一致で比較し、分割・
疎形式への変換で既存の計算結果が変わらないことを保証します。

すべての移行テストが十分な期間安定し、新実装側の境界値テストで同等の範囲を直接カバー
できた段階で、旧実装と重複する生成元データの整理を別変更として行います。
