import type { Dumper } from './Dumper'
import type { Breaker } from './Breaker'

export interface EndpointEnv {
  dumper: Dumper
  originalRequest: Request
  prefix?: string
  breaker: Breaker
}


