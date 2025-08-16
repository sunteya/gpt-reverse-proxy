import { Hono } from 'hono'

export interface RetrySettings {
  max_attempts?: number
  backoff_ms?: number
  retry_on_status?: (number | '5xx')[]
}

export interface BreakerSettings {
  cooldown_ms?: number
}

export type UpstreamProtocol = 'ollama' | 'openai' | 'claude'

export interface UpstreamSettings {
  name: string
  protocols: UpstreamProtocol[] | undefined
  api_base: string
  api_key?: string
  https_proxy?: string | null

  plugins?: string[]
  models?: string[]
  model_aliases?: Record<string, string> | null
  priority?: number
  retry?: RetrySettings
  breaker?: BreakerSettings
}

export interface EndpointSettings {
  prefix: string
  type: string
  plugins?: string[]
}

export interface EndpointHandler {
  setupEndpointRoutes(app: Hono): void
}
