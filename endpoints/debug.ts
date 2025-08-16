import { Hono } from 'hono'
import { BaseEndpointHandler } from './base'
import { serveStatic } from '@hono/node-server/serve-static'
import * as utils from '../lib/utils'

export class DebugHandler extends BaseEndpointHandler {
  setupEndpointRoutes(app: Hono): void {
    const prefix = this.settings.prefix || ''

    const routers = new Hono()
    routers.use('/log/*', serveStatic({
      root: 'log',
      rewriteRequestPath: (p) => utils.stripPrefix(p, `${prefix}/log`),
    }))

    routers.use('/*', serveStatic({
      root: 'debug-ui/dist',
      rewriteRequestPath: (p) => utils.stripPrefix(p, prefix || null),
    }))

    app.route(prefix, routers)
  }
}


