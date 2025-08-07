import { MessageCreateParamsBase as ClaudeCompletionParams, TextBlockParam as ClaudeTextBlockParam } from '@anthropic-ai/sdk/resources/messages'
import consola from 'consola'
import { Context, Hono, Next } from 'hono'
import { Hook } from '../lib/Hook'

export class SimulateClaudeCodeClientHook extends Hook {
  name = 'simulate-claude-code-client'

  async on_messages_request(request: Request, ctx: Context) {
    const body = await request.json() as ClaudeCompletionParams
    const system = (typeof body.system == 'string')
      ? [ { text: body.system, type: 'text' } satisfies ClaudeTextBlockParam ]
      : body.system ?? []

    if (system.length === 0 || !system[0].text.includes("You are Claude Code")) {
      system.unshift({
        "type": "text",
        "text": "You are Claude Code, Anthropic's official CLI for Claude.",
        "cache_control": { "type": "ephemeral" }
      })
    }

    body.system = system
    return new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(body)
    })
  }

  simulateClaudeRequest(request: Request): Request {
    const headers = new Headers(request.headers)
    headers.delete('content-length')

    headers.set('user-agent', 'claude-cli/1.0.69 (external, cli)')
    headers.set('anthropic-beta', headers.get('anthropic-beta') ?? 'claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14')
    headers.set('anthropic-dangerous-direct-browser-access', headers.get('anthropic-dangerous-direct-browser-access') ?? 'true')
    headers.set('anthropic-version', headers.get('anthropic-version') ?? '2023-06-01')

    return new Request(request.url, {
      method: request.method,
      headers: headers,
      body: request.body
    })
  }

  isMessageRequest(request: Request) {
    return request.url.includes('/v1/messages')
  }

  async onRequest(request: Request, ctx: Context) {
    const newRequest = this.simulateClaudeRequest(request)

    if (this.isMessageRequest(request)) {
      return this.on_messages_request(newRequest, ctx)
    }

    return newRequest
  }
}

export default new SimulateClaudeCodeClientHook()