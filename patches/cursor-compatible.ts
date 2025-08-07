import { EventSourceMessage, EventSourceParserStream } from 'eventsource-parser/stream'
import { Context } from 'hono'
import { Hook } from '../lib/Hook'
import { DumpEventSourceStream } from '../lib/DumpEventSourceStream'
import { EventSourceEncoderStream } from '../lib/EventSourceEncoderStream'
import { DumpStream } from '../lib/DumpStream'

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
                                      .pipeThrough(new EventSourceParserStream())
                                      .pipeThrough(this.createFinishReasonCleanerStream())
                                      .pipeThrough(new DumpEventSourceStream('converted', ctx.get('dumper')))
                                      .pipeThrough(new EventSourceEncoderStream())
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

  createFinishReasonCleanerStream(): TransformStream<EventSourceMessage, EventSourceMessage> {
    return new TransformStream({
      transform: (source, controller) => {
        if (source.data === '[DONE]') {
          controller.enqueue(source)
          return
        }

        const json = this.parseObject(source.data)
        if (!json) {
          controller.enqueue(source)
          return
        }

        const choices = json.choices
        if (Array.isArray(json.choices)) {
          for (const choice of choices) {
            if (choice.finish_reason === null) {
              delete choice.finish_reason
            }
          }
        }

        controller.enqueue({ ...source, data: JSON.stringify(json) })
      }
    })
  }
}

export default new CursorCompatibleHook()