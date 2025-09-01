import { FinishReasonCleanerStream } from '$$/patches/cursor-compatible/FinishReasonCleanerStream'
import { convertLogFileToEvents } from '$$/spec/support/test-helpers'
import { glob } from 'glob'
import path from 'path'
import { describe, expect, it } from 'vitest'

describe('FinishReasonCleanerStream', () => {
  for (const file of glob.sync('*.jsonl', { cwd: __dirname, absolute: true })) {
    it(`should process stream from log file ${path.basename(file)}`, async () => {
      const subject = new FinishReasonCleanerStream()
      const events = await convertLogFileToEvents(file, subject)

      for (const message of events) {
        if (message.data == '[DONE]') {
          continue
        }

        expect(() => JSON.parse(message.data)).not.toThrow()
      }

      const fullContent = events.map(it => it.data).join("\n")
      expect(fullContent).not.toContain('"finish_reason":null')
    })
  }
})
