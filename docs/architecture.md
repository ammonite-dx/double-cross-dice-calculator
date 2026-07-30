# アーキテクチャ

このアプリはCloudflare Pagesで配信する静的SPAです。サーバー側の計算やデータベースを必要とせず、事前計算済み確率分布の取得と追加計算をブラウザ内で行います。

## モジュール境界

- `ScoreCalculator.js`: 一般判定・対決判定の達成値と成功率
- `DamageCalculator.js`: ダメージ、期待値、複数コンボの合計
- `BacktrackCalculator.js`: バックトラック後の侵蝕率
- `Distribution.js`: 疎な分布の展開、期待値、上側確率などの共通処理
- `FFT.js`: 独立な確率分布の加算・減算
- `PrecomputedDataRepository.js`: 静的アセットの取得、検証、キャッシュ

Vueコンポーネントは入力状態と表示を管理し、確率計算そのものは上記モジュールへ委譲します。計算モジュールはVueに依存しません。

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

ルート表示前に初期値で必要なアセットを読み込みます。`shihai`や`kazanari`が変わった場合は対応する分割ファイルだけを追加取得します。連続した入力変更ではリビジョン番号を使い、古い非同期計算結果で新しい入力結果を上書きしないようにします。

`dr`の配信形式は圧縮効率を優先したダイス数ごとの疎な分布ですが、ダメージ計算ではダメージ値ごとに連続走査できる型付き配列のビューへ変換してキャッシュします。計算時は確率が非ゼロの達成値だけを昇順に処理し、既存結果との完全一致を保ちながら走査量を減らします。

## 事前計算データ

事前計算データは`public/data/schema-v{schemaVersion}/revision-{dataRevision}/`に配置し、アプリ本体と同じデプロイから配信します。ファイル名に内容ハッシュは付けず、変更時は`dataRevision`を更新します。同一リビジョンのファイルは変更せず、長期キャッシュの対象にします。

現在の配信データはschema-v1/revision-3です。旧revision-1とrevision-2は比較用として`reference-data/`へ移し、Pagesの配信対象には含めません。詳しいスキーマ、ダイス数範囲の根拠、更新手順は[`precomputed-data.md`](./precomputed-data.md)を参照してください。

## 旧実装との比較

分離前の計算実装は`tests/legacy/LegacyCalculator.js`に回帰比較専用で残しています。本番コードから参照してはいけません。分割・疎形式への移行テストは新旧結果を比較し、Python生成器への移行で生じる6桁丸めの最小単位`0.000001`以内の差だけを許容します。

すべての移行テストが十分な期間安定し、新実装側の境界値テストで同等の範囲を直接カバーできた段階で、旧実装と重複する生成元データの整理を別変更として行います。
