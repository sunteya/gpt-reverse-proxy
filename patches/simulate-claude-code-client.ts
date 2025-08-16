import { MessageCreateParamsBase as ClaudeCompletionParams, TextBlockParam as ClaudeTextBlockParam } from '@anthropic-ai/sdk/resources/messages'
import { EndpointEnv } from '../lib/EndpointEnv'
import { Hook } from '../lib/Hook'
import { CLAUDE_MESSAGES_PATH } from '../protocols'

export class SimulateClaudeCodeClientHook extends Hook {
  name = 'simulate-claude-code-client'

  async on_messages_request(request: Request, env: EndpointEnv) {
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

  async onRequest(request: Request, env: EndpointEnv) {
    const newRequest = this.simulateClaudeRequest(request)

    if (request.url.includes(CLAUDE_MESSAGES_PATH)) {
      return this.on_messages_request(newRequest, env)
    }

    return newRequest
  }
}

export default new SimulateClaudeCodeClientHook()