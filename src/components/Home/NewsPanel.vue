<script setup>
    import { mdiNewspaperVariantOutline } from '@mdi/js'
</script>

<template>
    <v-card class="ma-0">
        <v-card-title><v-icon :icon="mdiNewspaperVariantOutline"/> お知らせ</v-card-title>
        <v-divider class="mx-2"/>
        <v-card-text class="pa-6 ma-0 text-md-body-1 text-caption">
            <v-table>
                <tbody>
                    <tr>
                        <td class="py-0 pl-0 pr-2" style="white-space:nowrap;">2024-06-02</td>
                        <td class="pa-0">ver.1.1を公開しました。《妖精の手》《支配の領域》等、ダイス目を操作する効果を計算可能になりました。《風鳴りの爪》等、ダメージロールを振り直す効果を計算可能になりました。バックトラックに影響するDロイスの効果を計算可能になりました。</td>
                    </tr>
                    <tr>
                        <td class="py-0 pl-0 pr-2" style="white-space:nowrap;">2023-04-28</td>
                        <td class="pa-0">「攻撃」ページのダメージ分布のグラフ等で、最小値の指定時に予期せぬエラーメッセージが表示されてしまう不具合を修正しました。</td>
                    </tr>
                    <tr>
                        <td class="py-0 pl-0 pr-2" style="white-space:nowrap;">2023-03-29</td>
                        <td class="pa-0">「ホーム」ページに紹介動画を追加しました。</td>
                    </tr>
                    <tr>
                        <td class="py-0 pl-0 pr-2" style="white-space:nowrap;">2023-03-25</td>
                        <td class="pa-0">DCDCを公開しました。</td>
                    </tr>
                </tbody>
            </v-table>
        </v-card-text>
    </v-card>
</template>

<style>
::v-deep .v-data-table__wrapper tbody tr:not(:last-child) td {
  border-bottom: none;
}
</style>