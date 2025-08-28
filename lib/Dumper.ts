
import fs from 'fs'
import path from 'path'
import dayjs from 'dayjs'

export function generateDumpFilePath(requestPath: string): string {
  let cleanPath = requestPath.split('?')[0].replace(/[<>:"|*?]/g, '_')

  if (cleanPath.startsWith('/')) {
    cleanPath = cleanPath.substring(1)
  }
  if (cleanPath.endsWith('/')) {
    cleanPath = cleanPath.slice(0, -1)
  }
  cleanPath = cleanPath || 'root'

  const dumpDir = path.join('log', ...cleanPath.split('/').filter(p => p))
  fs.mkdirSync(dumpDir, { recursive: true })

  const fileTimestamp = dayjs().format('YYYYMMDDHHmmssSSS')
  return path.join(dumpDir, `${fileTimestamp}.jsonl`)
}

export interface DumpEntry {
  timestamp: string
  leg: 'user' | 'upstream' | null
  direction: 'request' | 'response'
  event: string
  payload: Record<string, any>
}

export class Dumper {
  filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath
  }

  public dump(leg: 'user' | 'upstream' | null, direction: 'request' | 'response', event: string, payload: Record<string, any>) {
    const dumpEntry: DumpEntry = {
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss.SSS'),
      leg,
      direction,
      event,
      payload,
    }

    // console.log(event, dumpEntry)
    fs.appendFileSync(this.filePath, JSON.stringify(dumpEntry) + '\n')
  }
}

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
        dumper.dump(leg, direction, 'chunk', { text: decoded })
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
