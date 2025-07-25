import type {} from 'hono'

declare module 'hono' {
  interface ContextVariableMap {
    rewrite_path: string
  }
} 