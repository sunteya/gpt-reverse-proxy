import { createParser, type EventSourceMessage } from 'eventsource-parser'
import { EndpointEnv } from '../lib/EndpointEnv'
import { Hook, HookRequestContext } from '../lib/Hook'
import { OPENAI_CHAT_COMPLETIONS_PATH } from '../protocols'
import _, { result } from 'lodash'

export abstract class KeywordInterceptorStream extends TransformStream<string, string> {
  preBuffer = ''
  postBuffer = ''
  intercepted = false

  keyword!: string

  constructor() {
    super({
      transform: (chunk, controller) => this.transform(chunk, controller),
      flush: (controller) => this.flush(controller),
    })
  }

  transform(chunk: string, controller: TransformStreamDefaultController<string>) {
    if (this.intercepted) {
      this.postBuffer += chunk
      this.processPostData()

      if (!this.intercepted) {
        this.enqueueBuffer(controller)
      }
    } else {
      const result = this.matchKeyword(this.preBuffer + chunk)
      if (result.type == 'matched') {
        this.intercepted = true
        this.postBuffer = result.post
        this.preBuffer = result.pre
        this.processPostData()
        if (!this.intercepted) {
          this.enqueueBuffer(controller)
        }
      } else if (result.type == 'partial') {
        this.preBuffer = result.buffer
      } else {
        this.preBuffer = result.buffer
        this.enqueueBuffer(controller)
      }
    }
  }

  abstract flush(controller: TransformStreamDefaultController<string>): void

  abstract processPostData(): void

  matchKeyword(raw: string) {
    const keywordIndex = raw.indexOf(this.keyword)
    if (keywordIndex != -1) {
      const pre = raw.substring(0, keywordIndex + this.keyword.length)
      const post = raw.substring(keywordIndex + this.keyword.length)
      return { type: 'matched', pre, post } as const
    } else if (this.isPartialMatch(raw, this.keyword)) {
      return { type: 'partial', buffer: raw } as const
    } else {
      return { type: 'not-matched', buffer: raw } as const
    }
  }

  enqueueBuffer(controller: TransformStreamDefaultController<string>) {
    const content = this.preBuffer + this.postBuffer
    this.preBuffer = ''
    this.postBuffer = ''

    if (content) {
      controller.enqueue(content)
    }
  }

  isPartialMatch(buffer: string, keyword: string): boolean {
    for (let i = Math.min(buffer.length, keyword.length - 1); i > 0; i--) {
      const suffix = buffer.substring(buffer.length - i)
      if (keyword.startsWith(suffix)) {
        return true
      }
    }

    return false
  }
}

export class CombineFinishChunkStream extends KeywordInterceptorStream {
  keyword = ',"finish_reason":'

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
    let finishChunkRemains = this.postBuffer.substring(0, finishEndIndex + 2)
    const remainingBuffer = this.postBuffer.substring(finishEndIndex + 2)

    let messages = [] as EventSourceMessage[]
    const parser = createParser({
      onEvent: (event: EventSourceMessage) => {
        if (event.data == '[DONE]') {
          return
        }

        if (event.data) { messages.push(event) }
      },
    })
    parser.feed(remainingBuffer)
    
    let choiceIndex = messages.findIndex(message => {
      try {
        const json = JSON.parse(message.data)
        if (_.isEmpty(json.choices)) {
          return true
        }
        return false
      } catch (e) {
        return true
      }
    })

    if (choiceIndex != -1) {
      // const finishReason = finishChunkRemains.match(/^"([^"]*)"/)![1]
      // this.preBuffer = this.preBuffer.substring(0, this.preBuffer.length - this.keyword.length)
      // this.postBuffer = finishChunkRemains.substring(finishReason.length + 2)

      this.postBuffer = finishChunkRemains
      // const finishMessage = this.combineMessages(messages.slice(0, choiceIndex), undefined)
      // this.postBuffer += `data: ${finishMessage.data}\n\n`
    } else {
      this.postBuffer = finishChunkRemains
      choiceIndex = 0
    }

    for (let i = choiceIndex; i < messages.length; i++) {
      const message = messages[i]
      this.postBuffer += `data: ${message.data}\n\n`
    }

    this.postBuffer += "data: [DONE]\n\n"
    this.enqueueBuffer(controller)
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

export class FinishReasonCleanerStream extends KeywordInterceptorStream {
  keyword = ',"finish_reason":'

  flush(controller: TransformStreamDefaultController<string>) {
    if (this.intercepted) {
      this.processPostData()
    }

    this.enqueueBuffer(controller)
  }

  processPostData() {
    const target = "null"

    const buffer = this.postBuffer.trimStart()
    if (buffer.startsWith(target)) {
      this.preBuffer = this.preBuffer.substring(0, this.preBuffer.length - this.keyword.length)
      this.postBuffer = buffer.substring(target.length)

      const result = this.matchKeyword(this.postBuffer)
      if (result.type == 'matched') {
          this.preBuffer += result.pre
          this.postBuffer = result.post
          this.processPostData()
      } else if (result.type == 'partial') {
          this.preBuffer += result.buffer
          this.postBuffer = ''
          // wait for next chunk
      } else {
          this.intercepted = false
      }
    } else if (target.startsWith(buffer)) {
      // Do nothing and let the state be preserved for the next chunk.
    } else {
      this.intercepted = false
    }
  }
}

class CursorCompatibleHook extends Hook {
  name = 'cursor-compatible'

  async onRequest(request: Request, env: EndpointEnv, ctx: HookRequestContext) {
    if (request.method === 'POST' && request.url.includes(OPENAI_CHAT_COMPLETIONS_PATH)) {
      ctx.addResponse((resp) => {
        return this.isStreamingResponse(resp) ? this.convert_stream_chunk_response(resp, (stream) => {
          return stream
            .pipeThrough(new FinishReasonCleanerStream())
            .pipeThrough(new CombineFinishChunkStream())
        }) : resp
      })

      const body = await request.clone().json()
      if (body.model == "gpt-5") {
        body.max_completion_tokens = body.max_tokens
        body.temperature = 1
        delete body.max_tokens
      }

      const headers = new Headers(request.headers)
      headers.delete('content-length')

      return new Request(request.url, {
        method: request.method,
        headers,
        body: JSON.stringify(body)
      })
    }

    return request
  }
}

export default CursorCompatibleHook
