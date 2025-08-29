import { describe, it, expect } from 'vitest'
import { CombineFinishChunkStream, FinishReasonCleanerStream } from '$$/patches/cursor-compatible'
import fs from 'fs/promises'
import path from 'path'
import { createParser, EventSourceMessage } from 'eventsource-parser'
import { loadChunksFromLogFile } from '$$/spec/support/test-helpers'

async function collectStream(stream: ReadableStream<string>): Promise<string[]> {
  const chunks: string[] = []
  const reader = stream.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return chunks
}

describe('CombineFinishChunkStream', () => {
  const files = [
    "CombineFinishChunkStream.20250829092101164.jsonl",
    "CombineFinishChunkStream.20250828015057162.jsonl",
    "CombineFinishChunkStream.20250828164422336.jsonl",
  ]
  for (const file of files) {
    it(`should process stream from log file ${file}`, async () => {
      const inputEntries = await loadChunksFromLogFile(__dirname, file)

      const inputStream = new ReadableStream<string>({
        start(controller) {
          inputEntries
            .filter(it => it.leg == 'upstream' && it.direction == 'response' && it.event == 'chunk')
            .forEach(it => controller.enqueue(it.payload.text + "\n\n"))
          controller.close()
        }
      })

      const subject = new CombineFinishChunkStream()
      const outputChucks = await collectStream(
        inputStream.pipeThrough(new FinishReasonCleanerStream())
                   .pipeThrough(subject)
      )

      const messages = [] as EventSourceMessage[]
      const parser = createParser({
        onEvent: (event: EventSourceMessage) => {
          messages.push(event)
        },
      })
      for (const chunk of outputChucks) {
        parser.feed(chunk)
      }

      expect(messages.at(-1)?.data).toBe("[DONE]")
      const finishMessages = messages.filter(message => {
        try {
          const json = JSON.parse(message.data)
          return !!json.choices[0].finish_reason
        } catch (e) {
          return false
        }
      })

      expect(finishMessages.length).toBe(1)
      expect(finishMessages[0].data).toContain(`"tool_calls":`)
    })
  }
})