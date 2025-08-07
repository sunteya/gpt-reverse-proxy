import { Hono, Context, Next } from 'hono'
import { BaseEndpointHandler } from './base'
import { EndpointSettings } from './types'
import { UpstreamRegistry } from '../lib/UpstreamRegistry'

export class ClaudeHandler extends BaseEndpointHandler {
  setupEndpointRoutes(app: Hono): void {
    app.all(`${this.settings.prefix}/*`, this.action(this.handle_remaining_routes))
  }
}