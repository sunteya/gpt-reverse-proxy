import type { Context, MiddlewareHandler, Hono } from 'hono'

export function handleChatCompletions(upstream: MiddlewareHandler) {
  return async (c: Context) => {
    const response = await upstream(c, async () => {})

    if (!response) {
      return c.text('Proxy middleware failed to return a response.', 500)
    }

    if (!response.body) {
      return response
    }

    const { readable, writable } = new TransformStream({
      transform(chunk, controller) {
        const modifiedChunk = Buffer.from(chunk)
          .toString('utf-8')
          .replace(/,"finish_reason":null/g, '')
          .replace(/,"usage":null/g, '')
        controller.enqueue(new TextEncoder().encode(modifiedChunk))
      },
    })

    response.body.pipeTo(writable)
    return new Response(readable, response)
  }
}

export function registerOpenAIRoutes(routes: Hono, upstream: MiddlewareHandler) {
  routes.post('/v1/chat/completions', handleChatCompletions(upstream))
}