import type {} from 'hono'
import { Dumper } from '../proxy/dumper'

declare module 'hono' {
  interface ContextVariableMap {
    dumper?: Dumper
    rewrite_path: string
  }
}
