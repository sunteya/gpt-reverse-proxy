<script setup lang="ts">
import { computed } from 'vue'
import type { LogInfoEntry } from '~/models/LogEntry'
import Well from '~/components/Well.vue'
const props = defineProps<{ logs: LogInfoEntry[] }>()
const userLogs = computed(() => props.logs.filter(l => l.leg === 'user'))
const upstreamLogs = computed(() => props.logs.filter(l => l.leg === 'upstream'))
</script>

<template>
  <div class="bg-blue-100 p-2 rounded-md mb-2">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
      <div>
        <div class="font-semibold text-blue-800">(user)</div>
        <div v-if="userLogs.length === 0" class="text-sm text-gray-600">无</div>
        <div v-for="(log, i) in userLogs" :key="log.timestamp + '-' + i" class="bg-white p-2 rounded-md mt-1 text-sm">
          <div>{{ log.payload.method }} {{ log.payload.url }}</div>
          <Well>{{ JSON.stringify(log.payload.headers, null, 2) }}</Well>
        </div>
      </div>
      <div>
        <div class="font-semibold text-blue-800">(upstream)</div>
        <div v-if="upstreamLogs.length === 0" class="text-sm text-gray-600">无</div>
        <div v-for="(log, i) in upstreamLogs" :key="log.timestamp + '-' + i" class="bg-white p-2 rounded-md mt-1 text-sm">
          <div>{{ log.payload.method }} {{ log.payload.url }}</div>
          <Well>{{ JSON.stringify(log.payload.headers, null, 2) }}</Well>
        </div>
      </div>
    </div>
  </div>
</template>

