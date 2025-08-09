import { EventSourceParserStream } from 'eventsource-parser/stream'
import { EndpointEnv } from './EndpointEnv'
import { EventSourceEncoderStream } from './EventSourceEncoderStream'
import { EventSourceMessage } from 'eventsource-parser'

export type HookOnResponse = (response: Response, env: EndpointEnv) => Promise<Response> | Response
export interface HookRequestContext { addResponse(handler: HookOnResponse): void }

export abstract class Hook {
  name!: string

  isStreamingResponse(response: Response): boolean {
    const contentType = response.headers.get('content-type') || ''
    return contentType.includes('text/event-stream') || contentType.includes('application/stream')
  }

  async onRequest(request: Request, env: EndpointEnv, ctx: HookRequestContext) {
    return request
  }

  convert_stream_event_response(response: Response, converter: TransformStream<EventSourceMessage, EventSourceMessage>) {
    const originalStream = response.body
    if (!originalStream) {
      return response
    }

    const eventStream = originalStream
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new EventSourceParserStream())
      .pipeThrough(converter)
      .pipeThrough(new EventSourceEncoderStream())
      .pipeThrough(new TextEncoderStream())

    return new Response(eventStream, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    })
  }

  convert_stream_chunk_response(response: Response, converter: TransformStream<string, string>) {
    const originalStream = response.body
    if (!originalStream) {
      return response
    }

    const eventStream = originalStream
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(converter)
      .pipeThrough(new TextEncoderStream())

    return new Response(eventStream, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    })
  }

  async convert_json_response(response: Response, converter: (json: any) => any) {
    if (response.status !== 200) {
      return response
    }

    const json = await response.json()
    const newJson = converter(json)
    return new Response(JSON.stringify(newJson), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    })
  }
}
