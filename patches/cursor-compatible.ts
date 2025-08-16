import { Context } from 'hono'
import { EndpointEnv } from '../lib/EndpointEnv'
import { DumpStream } from '../lib/DumpStream'
import { Hook, HookRequestContext } from '../lib/Hook'
import { OPENAI_CHAT_COMPLETIONS_PATH } from '../protocols'

class FinishReasonCleanerStream extends TransformStream<string, string> {
  buffer = ''
  target = ',"finish_reason":null'
  targetLen = this.target.length

  constructor() {
    super({
      transform: (chunk, controller) => this.transform(chunk, controller),
      flush: (controller) => this.flush(controller),
    })
  }

  transform(chunk: string, controller: TransformStreamDefaultController<string>) {
    const combined = this.buffer + chunk
    const cleaned = combined.replaceAll(this.target, '')

    let holdBackPosition = -1

    // Find the longest suffix of `cleaned` that is a prefix of `target`.
    for (let i = Math.min(cleaned.length, this.targetLen - 1); i > 0; i--) {
      const suffix = cleaned.substring(cleaned.length - i)
      if (this.target.startsWith(suffix)) {
        holdBackPosition = cleaned.length - i
        break
      }
    }

    if (holdBackPosition !== -1) {
      const partToEnqueue = cleaned.substring(0, holdBackPosition)
      this.buffer = cleaned.substring(holdBackPosition)
      if (partToEnqueue) {
        controller.enqueue(partToEnqueue)
      }
    } else {
      this.buffer = ''
      if (cleaned) {
        controller.enqueue(cleaned)
      }
    }
  }

  flush(controller: TransformStreamDefaultController<string>) {
    if (this.buffer) {
      controller.enqueue(this.buffer)
    }
  }
}

class CursorCompatibleHook extends Hook {
  name = 'cursor-compatible'

  async onRequest(request: Request, env: EndpointEnv, ctx: HookRequestContext) {
    if (request.url.includes(OPENAI_CHAT_COMPLETIONS_PATH)) {
      ctx.addResponse((resp) => {
        return this.isStreamingResponse(resp) ? this.convert_stream_chunk_response(resp, new FinishReasonCleanerStream()) : resp
      })
    }

    return request
  }
}

export default new CursorCompatibleHook()
