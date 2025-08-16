import { EndpointHandler, EndpointSettings } from './types'
import { OpenAIHandler } from './openai'
import { OllamaHandler } from './ollama'
import { ClaudeHandler } from './claude'
import { DebugHandler } from './debug'
import { UpstreamRegistry } from '../lib/UpstreamRegistry'
import { HookRegistry } from '../lib/HookRegistry'

const handlerClasses = {
  openai: OpenAIHandler,
  ollama: OllamaHandler,
  claude: ClaudeHandler,
  debug: DebugHandler,
}

export function createHandler(type: string, settings: EndpointSettings, upstreams: UpstreamRegistry, hooks: HookRegistry): EndpointHandler | undefined {
  const HandlerClass = handlerClasses[type as keyof typeof handlerClasses]
  if (!HandlerClass) {
    return undefined
  }

  return new HandlerClass(settings, upstreams, hooks)
}