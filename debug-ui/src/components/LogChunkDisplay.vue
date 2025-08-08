<script setup lang="ts">
import { computed } from 'vue'
import type { LogChunkEntry } from '~/models/LogEntry'
import Well from '~/components/Well.vue'
import isPlainObject from 'lodash/isPlainObject'

type ParsedRecord = Record<string, string | Record<string, unknown>>

const props = defineProps<{
  logs: LogChunkEntry[]
}>()

const userLogs = computed(() => props.logs.filter(l => l.leg === 'user'))
const upstreamLogs = computed(() => props.logs.filter(l => l.leg === 'upstream'))

function tryParseJson(text: string): unknown { try { return JSON.parse(text) } catch { return text } }

function parseSseChunk(chunk: string): ParsedRecord[] {
  const normalized = String(chunk ?? '').replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const results: ParsedRecord[] = []
  let current: ParsedRecord | null = null
  let dataParts: string[] = []
  const finalize = () => {
    if (!current && dataParts.length === 0) return
    if (!current) current = {}
    if (dataParts.length) {
      const text = dataParts.join('\n')
      const parsed = tryParseJson(text)
      current.data = isPlainObject(parsed) ? (parsed as Record<string, unknown>) : text
      dataParts = []
    }
    results.push(current)
    current = null
  }
  for (const rawLine of lines) {
    const line = rawLine
    if (line === '') { finalize(); continue }
    if (line.startsWith(':')) { current = current || {}; current.comment = (current.comment ? String(current.comment) + '\n' : '') + line.slice(1).trim(); continue }
    const idx = line.indexOf(':')
    const field = (idx >= 0 ? line.slice(0, idx) : line).trim()
    const value = (idx >= 0 ? line.slice(idx + 1) : '').replace(/^\s+/, '')
    current = current || {}
    if (field === 'data') dataParts.push(value)
    else current[field] = value
  }
  finalize()
  if (results.length === 0 && normalized) { return [{ data: normalized }] }
  return results
}

function formatRecord(rec: ParsedRecord): string {
  const lines: string[] = []
  for (const key of Object.keys(rec)) {
    const value = (rec as any)[key]
    if (key === 'data' && isPlainObject(value)) lines.push(`${key}: ${JSON.stringify(value, null, 2)}`)
    else lines.push(`${key}: ${String(value)}`)
  }
  return lines.join('\n')
}

function formatRecords(records: ParsedRecord[]): string { return records.map(formatRecord).join('\n\n') }
</script>

<template>
  <div class="bg-yellow-100 p-2 rounded-md mb-2">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
      <div>
        <div class="font-semibold text-yellow-900">(user)</div>
        <div class="mt-1">
          <div v-if="userLogs.length === 0" class="text-sm text-gray-600">无</div>
          <div v-for="(log, i) in userLogs" :key="'u-'+log.timestamp+'-'+i">
            <Well>{{ formatRecords(parseSseChunk(log.payload.text)) }}</Well>
          </div>
        </div>
      </div>
      <div>
        <div class="font-semibold text-yellow-900">(upstream)</div>
        <div class="mt-1">
          <div v-if="upstreamLogs.length === 0" class="text-sm text-gray-600">无</div>
          <div v-for="(log, i) in upstreamLogs" :key="'a-'+log.timestamp+'-'+i">
            <Well>{{ formatRecords(parseSseChunk(log.payload.text)) }}</Well>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

