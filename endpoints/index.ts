import { EndpointHandler, EndpointSettings, UpstreamGetter } from './types'
import { OpenAIHandler } from './openai'
import { OllamaHandler } from './ollama'
import { ClaudeHandler } from './claude'

const handlerClasses = {
  openai: OpenAIHandler,
  ollama: OllamaHandler,
  claude: ClaudeHandler,
}

export function createHandler(type: string, settings: EndpointSettings, upstreamGetter: UpstreamGetter): EndpointHandler | undefined {
  const HandlerClass = handlerClasses[type as keyof typeof handlerClasses]
  if (!HandlerClass) {
    return undefined
  }
  return new HandlerClass(settings, upstreamGetter)
}