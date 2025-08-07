import { Context } from 'hono'
import _ from 'lodash'

export abstract class Hook {
  name!: string

  isStreamingResponse(response: Response): boolean {
    const contentType = response.headers.get('content-type') || ''
    return contentType.includes('text/event-stream') || contentType.includes('application/stream')
  }

  parseObject(jsonStr: string): Record<string, any> | null {
    try {
      const parsed = JSON.parse(jsonStr)
      if (_.isPlainObject(parsed)) {
        return parsed
      }

      return null
    } catch {
      return null
    }
  }

  async onRequest(request: Request, ctx: Context) {
    return request
  }

  async onResponse(response: Response, request: Request, ctx: Context) {
    return response
  }
}