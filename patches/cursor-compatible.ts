import { EndpointEnv } from '../lib/EndpointEnv'
import { Hook, HookRequestContext } from '../lib/Hook'
import { OPENAI_CHAT_COMPLETIONS_PATH } from '../protocols'


export class FinishReasonCleanerStream extends TransformStream<string, string> {
  preBuffer = ''
  postBuffer = ''
  keyword = ',"finish_reason":'
  intercepted = false

  constructor() {
    super({
      transform: (chunk, controller) => this.transform(chunk, controller),
      flush: (controller) => this.flush(controller),
    })
  }

  transform(chunk: string, controller: TransformStreamDefaultController<string>) {
    if (this.intercepted) {
      this.postBuffer += chunk

      this.processPostData(controller)
      if (!this.intercepted) {
        this.enqueueBuffer(controller)
      }
    } else {
      this.preBuffer += chunk
      const keywordIndex = this.preBuffer.indexOf(this.keyword)

      if (keywordIndex !== -1) {
        this.intercepted = true
        this.postBuffer = this.preBuffer.substring(keywordIndex + this.keyword.length)
        this.preBuffer = this.preBuffer.substring(0, keywordIndex + this.keyword.length)

        this.processPostData(controller)

        if (!this.intercepted) {
          this.enqueueBuffer(controller)
        }
      } else if (this.isPartialMatch(this.preBuffer, this.keyword)) {
        // we found a partial keyword, we need to wait for more data
      } else {
        this.enqueueBuffer(controller)
      }
    }
  }

  flush(controller: TransformStreamDefaultController<string>) {
    this.enqueueBuffer(controller)
  }

  processPostData(controller: TransformStreamDefaultController<string>) {
    const target = "null"

    if (this.postBuffer.startsWith(target)) {
      this.preBuffer = this.preBuffer.replace(this.keyword, '')
      this.postBuffer = this.postBuffer.substring(target.length)
      this.intercepted = false
      this.enqueueBuffer(controller)
    } else if (target.startsWith(this.postBuffer)) {
      // it's a prefix, we need to wait for more data
      // do nothing, just buffer `chunk` into `postBuffer` which is already done.
    } else {
      this.intercepted = false
      this.enqueueBuffer(controller)
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

class CursorCompatibleHook extends Hook {
  name = 'cursor-compatible'

  async onRequest(request: Request, env: EndpointEnv, ctx: HookRequestContext) {
    if (request.method === 'POST' && request.url.includes(OPENAI_CHAT_COMPLETIONS_PATH)) {
      ctx.addResponse((resp) => {
        return this.isStreamingResponse(resp) ? this.convert_stream_chunk_response(resp, new FinishReasonCleanerStream()) : resp
      })

      const body = await request.clone().json()
      if (body.temperature == 0) {
        body.temperature = 1
      }

      if (body.model == "gpt-5") {
        body.max_completion_tokens = body.max_tokens
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

export default new CursorCompatibleHook()
