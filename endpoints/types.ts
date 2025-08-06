import { Hono } from 'hono'
import { BaseHook } from '../lib/BaseHook'

export interface Upstream {
  name: string
  groups: string[] | undefined
  api_base: string
  api_key: string
}

export interface EndpointSettings {
  prefix: string
  type: string
  group: string | undefined
  hooks?: string[]
}

export type UpstreamGetter = (group?: string) => Upstream | null

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

export type Hook = BaseHook

export interface EndpointHandler {
  setupEndpointRoutes(app: Hono): void
}