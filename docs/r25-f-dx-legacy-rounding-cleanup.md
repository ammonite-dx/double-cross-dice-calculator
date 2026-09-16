# R25-F DX legacy rounding / compatibility cleanup

## 目的

R25-Fでは、productionのDX計算から移行期にだけ必要だった小数第6位丸めと互換オプションを取り除きます。runtimeは入力されたworking lengthへfull-precisionの確率を返し、公開JSONとの比較や過去データの参照は量子化誤差を明示した検証境界で行います。

## 背景

旧DX計算器は、引数なし呼出しを公開JSON互換のlegacy pathとして扱い、確率を小数第6位へ丸めた後に総和を1へ戻していました。working lengthを明示したdynamic pathには`unrounded`を指定する別経路があり、`size`、`roundingMode`、`fullPrecision`など複数の別名も受け付けていました。productionがcanonical runtimeへ統一された後は、この分岐が同じ計算器に二つの数値契約を残していました。

## 変更前

- `calculateDxDistribution`は、引数の有無や`rounding`指定に応じてlegacy丸めと未丸めを切り替えていました。
- `normalizeDxOptions`は`size`別名と複数の丸め名を正規化していました。
- `shihai=0`の分布生成は、安定なtail計算と累積分布のべき乗を切り替えられました。
- `CalculationClient`のDXキャッシュキーは丸めモードを含んでいました。

## 変更後

- DXの全経路がfull-precisionの分布を使い、最後に有限性、負値、総和を一つの正規化処理で検証します。
- `shihai=0`では`log1p`と`expm1`を用いたtail差分を常に使い、確率の小さい差分を累積分布の減算で失いにくくします。
- `normalizeDxOptions`が受け付けるDX固有オプションは`workingLength`と`fftLength`だけです。`workingLength`の既定値は`DX_DISTRIBUTION_SIZE`で、配列長と計算量の安全上限は維持します。
- DXキャッシュの同一性は入力、working length、FFT長だけで決まり、丸めモードは含みません。
- 旧JSONとの比較は、JSON側の小数第6位量子化を考慮した`1e-6 + 1e-12`の許容誤差で行います。

## 削除したもの

- runtimeの小数第6位丸めと総和補正。
- `size`、`rounding`、`roundingMode`、`fullPrecision`およびそれらの別名。
- `stableTail`切替フラグと、累積分布のべき乗へ戻る互換分岐。
- Score、R22測定、runtime DXキャッシュに残っていた旧オプション指定。

## 維持するもの

- DXのルール、クリティカル値、強制失敗、ファンブル、`shihai`、`yousei`、技能値シフトの意味論。
- `DX_DISTRIBUTION_SIZE=2048`、直接APIの最小・最大working length、計算量・メモリの絶対安全上限。
- `Float64`の微小負値を許容範囲内だけ0へ補正する検証と、非有限値・意味のある負値・無効な総和を拒否する契約。
- 旧公開JSON、Python generator、published-bucket投影、Reference repository。これらは歴史的な量子化済みデータの生成・参照・回帰比較に限定して使用します。

## 検証

F1のruntime整理、F2のテスト・検証経路移行、F3の文書更新をこの順に適用します。`tests/dxOnDemand.test.js`はruntimeのfull-precision性と旧JSONとの差分許容を検証し、`scripts/verify-runtime-dx.mjs`は旧assetのcoverage内で20,000ケースを同じworking length指定で監査します。通常のVitest、ESLint、Markdown lint、build、production smoke、generator検証、R23のdamage precision／tail監査をrelease gateとして実行します。

## 保留事項

公開JSONの再生成時に量子化をやめるか、JSON自体を削除するかは、Reference repositoryと公開データの将来方針を決める別タスクです。本変更では旧assetを変更せず、runtimeとreferenceの数値契約だけを分離します。
