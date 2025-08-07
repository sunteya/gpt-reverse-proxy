import { Hono } from 'hono'

export interface UpstreamSettings {
  name: string
  groups: string[] | undefined
  api_base: string
  api_key: string
  https_proxy?: string | null
}

export interface EndpointSettings {
  prefix: string
  type: string
  group: string | undefined
  hooks?: string[]
}

export interface RequestData {
  url: string
  method: string
  headers: Record<string, string>
  body: string | null
}

export interface ResponseData {
  status: number
  headers: Record<string, string>
  body: string | null
  request?: RequestData
}

export interface EndpointHandler {
  setupEndpointRoutes(app: Hono): void
}
