# ADR 0002: 計算コアを実行環境から分離する

- 状態: 採用
- 決定日: 2026-08-07

## 背景

現在のアプリはCloudflare Pages上の静的SPAとして完結し、Vueコンポーネントがブラウザ内の計算モジュールを直接呼び出します。計算モジュール自体はVueへ依存していませんが、静的アセットの取得、ブラウザ上の実行、画面状態への反映が同じ利用経路に含まれています。

判定とダメージをオンデマンド計算へ移行すると、計算ロジックをブラウザ内Web Workerで実行できるようになります。同じ計算機能を外部HTTP APIとして公開すれば第三者のサービスから利用でき、将来はModel Context Protocolを通じてAIクライアントへ提供することもできます。一方、公開サイトを外部APIへ全面的に依存させると、ネットワーク遅延、API障害、利用量に応じた費用、濫用対策、認証、バージョニングなど、現在の静的構成にはない運用責務が発生します。

Cloudflare Workersは静的アセットとAPIを一つのデプロイ単位として扱えますが、動的なAPI呼び出しにはWorkersのCPU時間とメモリ制限が適用されます。Workers FreeのHTTPリクエストはCPU時間10 ms、メモリ128 MBであり、今回のオンデマンド計算実験には10 msを超えるケースがあります。[Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)、[Workersの制限](https://developers.cloudflare.com/workers/platform/limits/)

## 決定

計算ロジックを、ブラウザ、Vue、HTTP、Cloudflare固有APIに依存しない計算コアとして分離します。UIは計算コアやデータ取得処理を直接呼ばず、判定、ダメージ、バックトラックを提供する`CalculationClient`相当の抽象的なインターフェースだけに依存します。

当面の公開サイトは静的SPAとブラウザ内計算を維持し、ブラウザ内Web Workerを標準の実行先とします。計算コアを分離することと、公開サイトから計算コードを取り除いてAPI専用ビューワーにすることは別の判断として扱います。API専用ビューワー化は、サーバー計算の性能上の利点、通信を含む応答時間、可用性、運用費用がブラウザ内計算より明確に優れると確認できるまで採用しません。

計算コアは当面同じリポジトリ内に置き、ブラウザ内Web Worker、将来のHTTP API、将来のMCPアダプターから同じ実装を利用します。リポジトリ分割は、独立したリリース周期、保守担当、利用者が必要になった場合にだけ再検討します。

HTTP APIの公開は、`dx`と`dr`のオンデマンド計算、動的な表示・中間計算範囲、打ち切り誤差、入力と資源の上限、オーバーフローバケットの意味が確定した後に行います。それまでは外部互換性を約束するAPI v1を定義しません。APIを試作する場合も公開サイトはブラウザ内計算を維持し、API障害がサイトの利用不能へ直結しない構成にします。

外部APIが必要になった段階では、Pagesとは独立してデプロイできるCalculation API Workerを第一候補とします。初期のAPI Workerは計算コアを直接インポートし、複数の公開面を独立してデプロイする必要が生じるまでService Bindingによる追加分割を行いません。Service Bindingは、HTTP APIとMCPなど複数のWorkerが共通計算サービスを呼ぶ段階で検討します。[Service Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)

MCPはHTTP APIまたは同等のアプリケーションサービスの契約が安定した後に、計算コアを呼ぶ薄いアダプターとして追加します。MCPを計算ロジックの正本にはしません。確率分布全体はAIのコンテキストを過度に消費するため、MCPの標準出力は期待値、成功率、指定値以上の確率、指定範囲、パーセンタイルなどの要約とし、完全な分布は明示的に要求された場合だけ返します。ステートレスな確率計算にはDurable Objectsを導入しません。[CloudflareのRemote MCP Serverガイド](https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/)

## 段階的な導入

1. 計算コア、入力と結果の型、`CalculationClient`、ブラウザ内Web Workerアダプターを同じリポジトリ内へ分離し、公開構成は変更しない。
2. `dx`と`dr`のオンデマンド計算および範囲決定処理を計算コアへ統合し、ブラウザと参照実装の適合テストを完成させる。
3. 入出力仕様が安定した後に独立API Workerを実験用URLへデプロイし、CPU時間、メモリ、レイテンシ、費用、入力制限を測定する。
4. OpenAPI、URLバージョニング、CORS、安定したエラー形式、レート制限、監視、利用量上限を用意してから第三者向けAPIを公開する。
5. AIクライアントからの具体的な利用需要と認証方針が定まった後に、ステートレスなMCPアダプターを追加する。
6. 公開サイトをAPI専用ビューワーにするかは、ブラウザ内計算を削除する明確な利益が得られた場合に改めて判断する。

## 影響

UI、ブラウザ内Web Worker、HTTP、MCPは同じ計算コアと適合テストを共有できるため、実行環境ごとの再実装と結果の不一致を避けられます。第三者にはホスト済みAPIだけでなく、将来は計算コアのライブラリを提供する選択肢も残ります。

一方、計算コアと利用側の間に入力・出力契約、非同期処理、エラー、キャンセルを扱う境界が増えます。HTTP APIを公開した後は、後方互換性、濫用対策、監視、費用管理が継続的な保守対象になります。CloudflareのRate Limiting Bindingはロケーション単位で最終的整合であり、正確な利用量会計には使えないため、入力とCPUの安全上限、WorkerのCPU上限、利用量監視を併用します。[Rate Limiting API](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)、[Workersの料金](https://developers.cloudflare.com/workers/platform/pricing/)

## 採用しなかった案

現状のUIから計算モジュールを直接呼ぶ構成を長期的に維持する案は、ブラウザ内Web Worker、外部API、MCPで同じ計算ロジックを再利用しにくいため採用しません。

計算コアの分離と同時に公開サイトをAPI専用ビューワーへ変更する案は、通信遅延とAPI障害をすべての利用者へ追加し、現在の静的SPAの可用性を失うため採用しません。

最初から計算コアを別リポジトリまたは複数のCloudflare Workerへ分割する案は、独立したリリースとデプロイ順序を管理する必要があり、現段階では得られる利益より複雑性が大きいため採用しません。

ステートレスな計算へDurable Objects、データベース、永続セッションを導入する案は、必要な状態がなく運用対象だけを増やすため採用しません。
