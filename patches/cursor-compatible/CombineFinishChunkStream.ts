import { EventSourceEncoderStream } from "$$/lib/EventSourceEncoderStream"
import { createParser, EventSourceMessage } from "eventsource-parser"
import { KeywordInterceptorStream } from "./KeywordInterceptorStream"
import _ from "lodash"

export class CombineFinishChunkStream extends KeywordInterceptorStream {
  keyword = ',"finish_reason":'
  encoder = new EventSourceEncoderStream()

  transform(chunk: string, controller: TransformStreamDefaultController<string>) {
    super.transform(chunk, controller)
    if (this.intercepted) {
      const finishEndIndex = this.postBuffer.indexOf("\n\n")
      const remainingBuffer = this.postBuffer.substring(finishEndIndex + 2)
      const messages = this.convertBufferToMessages(remainingBuffer)

      if (messages.length >= 2) {
        this.flush(controller)
      }
    }
  }

  convertBufferToMessages(buffer: string) {
    const messages = [] as EventSourceMessage[]
    const parser = createParser({
      onEvent: (event: EventSourceMessage) => {
        if (event.data == '[DONE]') {
          return
        }

        messages.push(event)
      }
    })
    parser.feed(buffer)
    return messages
  }

  processPostData() {
    const nullTarget = 'null'

    const post = this.postBuffer
    if (post.startsWith(nullTarget)) {
      const result = this.matchKeyword(post)
      if (result.type == 'matched') {
        this.preBuffer += result.pre
        this.postBuffer = result.post
        this.processPostData()
      } else if (result.type == 'partial') {
        // wait next chuck
      } else {
        this.intercepted = false
      }
    } else if (nullTarget.startsWith(post)) {
      // wait next chuck
    } else {
      // not null keep intercepted
    }
  }

  flush(controller: TransformStreamDefaultController<string>) {
    if (!this.intercepted) {
      this.enqueueBuffer(controller)
      return
    } else {
      this.intercepted = false
    }

    const finishEndIndex = this.postBuffer.indexOf("\n\n")
    const remainingBuffer = this.postBuffer.substring(finishEndIndex + 2)
    this.postBuffer = this.postBuffer.substring(0, finishEndIndex + 2)

    // enqueue remaining buffer
    this.enqueueBuffer(controller)

    const messages = this.convertBufferToMessages(remainingBuffer)
    if (messages.length > 0) {
      const last = messages.at(-1)
      if (!last!.data.includes('"finish_reason"')) {
        this.encoder.transform(last!, controller)
      }
    }
    
    // let choiceIndex = messages.findIndex(message => {
    //   try {
    //     const json = JSON.parse(message.data)
    //     if (!_.isEmpty(json.choices)) {
    //       return true
    //     }
    //     return false
    //   } catch (e) {
    //     return true
    //   }
    // })


    // if (choiceIndex != -1) {
    //   // const finishReason = finishChunkRemains.match(/^"([^"]*)"/)![1]
    //   // this.preBuffer = this.preBuffer.substring(0, this.preBuffer.length - this.keyword.length)
    //   // this.postBuffer = finishChunkRemains.substring(finishReason.length + 2)

    //   // const finishMessage = this.combineMessages(messages.slice(0, choiceIndex), undefined)
    // } else {
    //   // choiceIndex = 0
    // }


    // for (let i = choiceIndex + 1; i < messages.length; i++) {
    //   const message = messages[i]
    //   this.encoder.transform(message, controller)
    // }

    this.encoder.transform({ data: "[DONE]" }, controller)

    this.preBuffer = ''
    this.postBuffer = ''
    controller.terminate()
  }

  combineMessages(messages: EventSourceMessage[], finishReason: string | undefined): EventSourceMessage {
    return messages.reduce((result, item) => {
      const prev = JSON.parse(result.data)
      const curr = JSON.parse(item.data)

      const choices = [ ...prev.choices ?? [], ...curr.choices ?? [] ]
      prev.choices = [ choices.reduce((acc, choice) => {
        const delta = choice.delta ?? {}
        delete choice.delta

        for (const key in delta) {
          if (acc.delta[key]) {
            acc.delta[key] += delta[key]
          } else {
            acc.delta[key] = delta[key]
          }
        }

        return { ...acc, ...choice, finish_reason: finishReason }
      }, { delta: {} }) ]

      return { ...item, ...result, data: JSON.stringify(prev) }
    }, { data: '{}' })
  }
}