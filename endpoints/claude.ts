import { Hono, Context, Next } from 'hono'
import { BaseEndpointHandler } from './base'
import { EndpointSettings, UpstreamGetter } from './types'

export class ClaudeHandler extends BaseEndpointHandler {
  constructor(settings: EndpointSettings, upstreamGetter: UpstreamGetter) {
    super(settings, upstreamGetter)
  }

  setupEndpointRoutes(app: Hono): void {
    // Default: proxy all requests to upstream through internal method
    app.all(`${this.settings.prefix}/*`, async (c: Context, next: Next) => {
      return this.handleProxyRequest(c, next)
    })
  }
}