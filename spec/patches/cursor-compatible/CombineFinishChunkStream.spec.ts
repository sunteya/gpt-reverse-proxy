import { describe, it, expect } from 'vitest'
import { convertLogFileToEvents } from '$$/spec/support/test-helpers'
import { CombineFinishChunkStream } from '$$/patches/cursor-compatible/CombineFinishChunkStream'
import * as glob from 'glob'
import path from 'path'
import _ from 'lodash'

describe('CombineFinishChunkStream', () => {
  let files = glob.sync('*.jsonl', { cwd: __dirname, absolute: true })
  // files = [
  //   path.join(__dirname, "CombineFinishChunkStream.20250830153922555.jsonl")
  // ]

  for (const file of files) {
    it(`should process stream from log file ${file}`, async () => {
      const subject = new CombineFinishChunkStream()
      const events = await convertLogFileToEvents(file, subject)

      const messages = [] as Record<string, any>[]
      for (const event of events) {
        if (event.data == '[DONE]') {
          continue
        }
  
        messages.push(JSON.parse(event.data))
      }

      // for (const message of messages) {
      //   console.log(JSON.stringify(message, null, 2))
      // }

      const finishReasonCount = _.sum(messages.map(it => _.get(it.choices, '0.finish_reason') ? 1 : 0))
      expect(finishReasonCount).toBe(1)
    })
  }
})