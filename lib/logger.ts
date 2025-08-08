import { Context, MiddlewareHandler, Next } from 'hono'
import { Dumper } from './Dumper'

function headersToObject(headers: Headers): Record<string, string> {
  const obj: Record<string, string> = {}
  for (const [key, value] of headers.entries()) {
    obj[key] = value
  }
  return obj
}

function dumpBody(dumper: Dumper, leg: 'user' | 'upstream', direction: 'request' | 'response', source: Request | Response): ReadableStream | null {
  if (!source.body) {
    return null
  }

  const [logBody, newBody] = source.body.tee()

  ;(async () => {
    const contentType = source.headers.get('content-type') || ''
    if (contentType.includes('text/event-stream')) {
      const reader = logBody.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const decoded = new TextDecoder().decode(value)
        for (const line of decoded.split('\n')) {
          if (!line.trim()) continue
          dumper.dump(leg, direction, 'chunk', { text: line })
        }
      }
    } else {
      const body = await new Response(logBody).text()
      if (body) {
        try {
          const json = JSON.parse(body)
          dumper.dump(leg, direction, 'body', json)
        } catch {
          dumper.dump(leg, direction, 'body', { text: body })
        }
      }
    }
  })()

  return newBody
}

export function dumpRequest(dumper: Dumper, leg: 'user' | 'upstream', request: Request): Request {
  dumper.dump(leg, 'request', 'info', {
    url: request.url,
    method: request.method,
    headers: headersToObject(request.headers),
  })

  const newBody = dumpBody(dumper, leg, 'request', request)
  return new Request(request, { body: newBody })
}

export function dumpResponse(dumper: Dumper, leg: 'user' | 'upstream', response: Response): Response {
  dumper.dump(leg, 'response', 'info', {
    status: response.status,
    statusText: response.statusText,
    headers: headersToObject(response.headers),
  })

  const newBody = dumpBody(dumper, leg, 'response', response)
  return new Response(newBody, response)
}

export const logger = (): MiddlewareHandler => {
  return async (c: Context, next: Next) => {
    const dumper = c.get('dumper') as Dumper
    if (!dumper) {
      return await next()
    }

    c.req.raw = dumpRequest(dumper, 'user', c.req.raw)

    await next()

    if (c.res) {
      c.res = dumpResponse(dumper, 'user', c.res)
    }
  }
}
