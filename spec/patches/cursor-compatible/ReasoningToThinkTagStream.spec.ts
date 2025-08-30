import { ReasoningToThinkTagStream } from '$$/patches/cursor-compatible/ReasoningToThinkTagStream'
import { collectStream, loadChunksFromLogFile } from '$$/spec/support/test-helpers'
import { EventSourceParserStream } from 'eventsource-parser/stream'
import { describe, it, expect } from 'vitest'

describe('ReasoningToThinkTagStream', () => {
  const files = [
    "ReasoningToThinkTagStream.20250828164422336.jsonl",
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

      const subject = new ReasoningToThinkTagStream()
      const events = await collectStream(
        inputStream.pipeThrough(subject)
                   .pipeThrough(new EventSourceParserStream())
      )

      const messages = events.filter(it => it.data != '[DONE]').map(it => JSON.parse(it.data))

      let indexFirst = -1
      let indexLast = -1
      for (let i = 0; i < messages.length; i++) {
        if (messages[i].choices?.[0].delta?.reasoning_content) {
          indexFirst = i
          break
        } else {
          indexLast = i - 1
        }
      }

      expect(messages.at(indexFirst)!.choices[0].delta.content).toContain('<think>')
      expect(messages.at(indexLast)!.choices[0].delta.content).not.toContain('</think>')
    })
  }
})