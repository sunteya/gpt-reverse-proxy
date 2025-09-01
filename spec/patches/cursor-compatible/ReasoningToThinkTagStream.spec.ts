import { ReasoningToThinkTagStream } from '$$/patches/cursor-compatible/ReasoningToThinkTagStream'
import { collectStream, convertLogFileToEvents, loadChunksFromLogFile } from '$$/spec/support/test-helpers'
import { EventSourceParserStream } from 'eventsource-parser/stream'
import _ from 'lodash'
import path from 'path'
import { describe, it, expect } from 'vitest'

describe('ReasoningToThinkTagStream', () => {
  const files = [
    // "ReasoningToThinkTagStream.20250828164422336.jsonl",
    "ReasoningToThinkTagStream.20250901013959775.jsonl",
  ]
  for (const file of files) {
    it(`should process stream from log file ${file}`, async () => {
      const events = await convertLogFileToEvents(path.join(__dirname, file), new ReasoningToThinkTagStream())
      const messages = events.filter(it => it.data != '[DONE]').map(it => JSON.parse(it.data))

      let indexFirst = -1
      let indexLast = -1
      for (let i = 0; i < messages.length; i++) {
        const message = messages[i]
        const content = _.get(message, 'choices.0.delta.content', '')
        if (content.startsWith('<think>')) {
          indexFirst = i
        }
        if (content.endsWith('</think>')) {
          indexLast = i
        }

        // console.log(JSON.stringify(message, null, 2))
      }

      expect(indexFirst).not.toBe(-1)
      expect(indexLast).not.toBe(-1)
    })
  }
})