import { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'

export function auth(localAuthToken: string | null) {
  return async (c: Context, next: Next) => {
    if (c.req.method === 'OPTIONS') {
      return next()
    }

    if (!localAuthToken) {
      return next()
    }

    const authorization = c.req.header('authorization') ?? ""
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : authorization

    if (token !== localAuthToken) {
      c.header('WWW-Authenticate', 'Bearer realm="API Access"')
      throw new HTTPException(401, { message: 'Invalid authorization token' })
    }

    return next()
  }
}
