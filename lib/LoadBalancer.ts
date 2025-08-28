import consola from 'consola'
import { EndpointEnv } from './EndpointEnv'
import { Hook } from './Hook'
import { Upstream } from './Upstream'
import * as utils from './utils'

export type BalanceConds = { model?: string | null }

export class LoadBalancer {
  interceptors: Hook[]

  constructor(interceptors: Hook[]) {
    this.interceptors = interceptors
  }

  isRetryStatus(status: number, retryOn: (number | '5xx')[]): boolean {
    return retryOn.some(x => {
      if (x === '5xx') {
        return status >= 500 && status <= 599
      }
      return status === x
    })
  }

  async forward(candidates: Upstream[], request: Request, env: EndpointEnv): Promise<Response> {
    // sort by priority asc, then shuffle among same priority
    const sorted = candidates.slice().sort((a, b) => (a.settings.priority ?? 1000) - (b.settings.priority ?? 1000))
    let i = 0
    while (i < sorted.length) {
      const p = sorted[i].settings.priority ?? 1000
      let j = i + 1
      while (j < sorted.length && (sorted[j].settings.priority ?? 1000) === p) {
        j++
      }
      for (let k = j - 1; k > i; k--) {
        const r = i + Math.floor(Math.random() * (j - i))
        const tmp = sorted[k]
        sorted[k] = sorted[r]
        sorted[r] = tmp
      }
      i = j
    }

    const bodyBuf = request.body ? await request.clone().arrayBuffer() : undefined
    let lastErr: unknown
    let lastRes: Response | undefined

    for (let ui = 0; ui < sorted.length; ui++) {
      const u = sorted[ui]
      const retry = u.settings.retry ?? {}
      const attempts = Math.max(1, retry.max_attempts ?? 1)
      const backoff = Math.max(0, retry.backoff_ms ?? 0)
      const retryOn = retry.retry_on_status ?? ['5xx', 429, 408, 409]

      for (let i = 0; i < attempts; i++) {
        const attemptReq = new Request(request.url, { method: request.method, headers: request.headers, body: bodyBuf ? bodyBuf.slice(0) : undefined })
        try {
          const res = await u.handle(attemptReq, env, this.interceptors)
          if (!this.isRetryStatus(res.status, retryOn)) {
            env.breaker.markSuccess(u.settings.name)
            return res
          }

          lastRes = res
          lastErr = new Error(`retryable status ${res.status} from ${u.name}`)
        } catch (e) {
          lastErr = e
        }
        if (i < attempts - 1 && backoff > 0) {
          await utils.sleep(backoff)
        }
      }

      env.breaker.markFailure(u.settings.name, u.settings.breaker)
    }

    if (lastRes) return lastRes
    consola.error(lastErr)
    return new Response('Service Unavailable', { status: 503 })
  }
}


