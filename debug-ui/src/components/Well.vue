<script setup lang="ts">
import { useAttrs } from 'vue'
const attrs = useAttrs()
const restAttrs = (() => { const { class: _c, ...rest } = attrs as any; return rest })()
</script>

<template>
  <pre v-bind="restAttrs" class="bg-white p-2 rounded-md mt-1 text-xs whitespace-pre-wrap break-words"><slot /></pre>
</template>


