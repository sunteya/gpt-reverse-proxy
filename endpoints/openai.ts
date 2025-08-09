import consola from 'consola'
import { Hono } from 'hono'
import { BaseEndpointHandler } from './base'
import { EndpointEnv } from '../lib/EndpointEnv'

export class OpenAIHandler extends BaseEndpointHandler {
  async handle_chat_completions(request: Request, env: EndpointEnv) {
    const req = request.clone()
    const json = await req.json()
    const model = String(json?.model)
    const upstream = this.upstreams.find({ model, protocol: this.settings.type })
    return upstream.handle(request, env, this.hooks)
  }

  setupEndpointRoutes(app: Hono): void {
    const routers = new Hono()
    routers.post('/v1/chat/completions', this.action(this.handle_chat_completions))
    routers.all('*', this.action(this.handle_remaining_routes))
    app.route(this.settings.prefix || '', routers)
  }
}
