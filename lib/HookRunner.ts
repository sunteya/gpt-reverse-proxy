import { Hook, HookOnResponse } from './Hook'
import { EndpointEnv } from './EndpointEnv'

type HookRun = { hook: Hook, responses: HookOnResponse[] }

export class HookRunner {
  runs: HookRun[] = []

  constructor(hooks: Hook[], public env: EndpointEnv) {
    this.runs = hooks.map(hook => {
      return { hook, responses: [] }
    })
  }

  async runRequest(request: Request): Promise<Request> {
    let req = request
    for (const run of this.runs) {
      req = await run.hook.onRequest(req, this.env, {
        addResponse: fn => run.responses.push(fn)
      })
    }
    return req
  }

  async runResponse(response: Response): Promise<Response> {
    let res = response
    for (const run of this.runs.toReversed()) {
      for (const fn of run.responses.toReversed()) {
        res = await fn(res, this.env)
      }
    }
    return res
  }
}


