import type { Dumper } from './Dumper'

export interface EndpointEnv {
  dumper: Dumper
  originalRequest: Request
  prefix?: string
}


