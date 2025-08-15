import { Hono } from 'hono'

export interface RetrySettings {
  max_attempts?: number
  backoff_ms?: number
  retry_on_status?: (number | '5xx')[]
}

export interface BreakerSettings {
  cooldown_ms?: number
}

export interface UpstreamSettings {
  name: string
  protocols: string[] | undefined
  api_base: string
  api_key?: string
  https_proxy?: string | null

  plugins?: string[]
  models?: string[]
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
