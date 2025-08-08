import { Context } from 'hono'
import { DumpStream } from '../lib/DumpStream'
import { Hook } from '../lib/Hook'

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

  handle_chat_completions_response(response: Response, request: Request, ctx: Context) {
    if (!this.isStreamingResponse(response)) {
      return response
    }

    const originalStream = response.body
    if (!originalStream) {
      return response
    }

    const eventStream = originalStream.pipeThrough(new TextDecoderStream())
                                      .pipeThrough(new DumpStream('raw chunk', ctx.get('dumper')))
                                      .pipeThrough(new FinishReasonCleanerStream())
                                      // .pipeThrough(new EventSourceParserStream())
                                      // .pipeThrough(new DumpEventSourceStream('converted', ctx.get('dumper')))
                                      // .pipeThrough(new EventSourceEncoderStream())
                                      .pipeThrough(new DumpStream('converted', ctx.get('dumper')))
                                      .pipeThrough(new TextEncoderStream())

    return new Response(eventStream, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    })
  }

  async onResponse(response: Response, request: Request, ctx: Context): Promise<Response> {
    if (request.url.includes('/v1/chat/completions')) {
      return this.handle_chat_completions_response(response, request, ctx)
    }

    return response
  }
}

export default new CursorCompatibleHook()
