<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type ComponentPublicInstance,
} from 'vue'

const props = defineProps<{
  ready: boolean
  preserveFootprint: boolean
}>()

const row = ref<ComponentPublicInstance | null>(null)
const lastReadyHeight = ref<number | null>(null)
let resizeObserver: ResizeObserver | null = null

function getRowElement(): HTMLElement | null {
  const element = row.value?.$el
  return element instanceof HTMLElement ? element : null
}

function recordReadyHeight(): void {
  const height = getRowElement()?.getBoundingClientRect().height
  if (height !== undefined && Number.isFinite(height) && height > 0) {
    lastReadyHeight.value = height
  }
}

const rowStyle = computed(() => {
  if (!props.ready && (!props.preserveFootprint || lastReadyHeight.value === null)) {
    return { display: 'none' }
  }
  if (!props.ready && props.preserveFootprint) {
    return { minHeight: `${lastReadyHeight.value}px` }
  }
  return undefined
})

watch(
  () => [props.ready, props.preserveFootprint] as const,
  ([ready, preserveFootprint]) => {
    if (ready) {
      void nextTick(recordReadyHeight)
    } else if (preserveFootprint) {
      // This pre-flush measurement runs before the summary slot is removed.
      recordReadyHeight()
    } else {
      // Errors, rejections, and explicit invalidation must not retain a stale
      // layout cache for a later request.
      lastReadyHeight.value = null
    }
  },
  { flush: 'pre' },
)

onMounted(() => {
  const element = getRowElement()
  if (element && typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(() => {
      if (props.ready) {
        recordReadyHeight()
      }
    })
    resizeObserver.observe(element)
  }
  if (props.ready) {
    void nextTick(recordReadyHeight)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<template>
  <v-row ref="row" class="layout-footprint-row" :style="rowStyle">
    <slot />
  </v-row>
</template>
