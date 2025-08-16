import consola from 'consola'
import { Hono } from 'hono'
import { BaseEndpointHandler } from './base'
import { EndpointEnv } from '../lib/EndpointEnv'
import { OPENAI_CHAT_COMPLETIONS_PATH } from '../protocols'

export class OpenAIHandler extends BaseEndpointHandler {
  async handle_chat_completions(request: Request, env: EndpointEnv) {
    const req = request.clone()
    const json = await req.json()
    const model = String(json?.model)
    const candidates = this.upstreams.findAll({ protocol: this.settings.type, model })
    return this.balancer.forward(candidates, request, env)
  }

  setupEndpointRoutes(app: Hono): void {
    const routers = new Hono()
    routers.post(OPENAI_CHAT_COMPLETIONS_PATH, this.action(this.handle_chat_completions))
    routers.all('*', this.action(this.handle_remaining_routes))
    app.route(this.settings.prefix || '', routers)
  }
}
