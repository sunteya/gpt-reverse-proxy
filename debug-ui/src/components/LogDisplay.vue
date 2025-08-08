<script setup lang="ts">
import { computed } from 'vue'
import type { LogEntry, LogInfoEntry, LogBodyEntry, LogChunkEntry } from '~/models/LogEntry'
import LogInfoDisplay from './LogInfoDisplay.vue'
import LogBodyDisplay from './LogBodyDisplay.vue'
import LogChunkDisplay from './LogChunkDisplay.vue'

const props = defineProps<{
  logs: LogEntry[]
}>()

const infoLogs = computed(() => props.logs.filter(log => log.event === 'info') as LogInfoEntry[])
const bodyLogs = computed(() => props.logs.filter(log => log.event === 'body') as LogBodyEntry[])
const chunkLogs = computed(() => props.logs.filter(log => log.event === 'chunk') as LogChunkEntry[])
const otherLogs = computed(() => props.logs.filter(log => !['info', 'body', 'chunk'].includes(log.event)))
</script>

<template>
  <div>
    <LogInfoDisplay v-if="infoLogs.length" :logs="infoLogs" />
    <LogBodyDisplay v-if="bodyLogs.length" :logs="bodyLogs" />
    <LogChunkDisplay v-if="chunkLogs.length" :logs="chunkLogs" />
    <div v-if="otherLogs.length">
      <pre v-for="(item, index) in otherLogs" :key="index" class="bg-gray-100 p-2 rounded-md whitespace-pre-wrap break-words mb-2 text-sm">{{ JSON.stringify(item, null, 2) }}</pre>
    </div>
  </div>
</template>

