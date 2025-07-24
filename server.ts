import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import _ from 'lodash'
import consola, { LogLevel } from 'consola'
import { logger } from './lib/logger'
import { proxy } from './lib/proxy'
import { registerOpenAIRoutes } from './lib/route-openai'

import env from './boot'

consola.level = LogLevel[_.capitalize(env.log_level)]
consola.info("env is", env)

const upstream = proxy({
  upstream_url: env.upstream_url,
  upstream_authorization: env.upstream_authorization,
  https_proxy: env.https_proxy,
})

const routes = new Hono()
registerOpenAIRoutes(routes, upstream)
routes.all('*', (c, next) => upstream(c, next))

const app = new Hono<{
  Variables: {
    path_prefix: string
  }
}>()
app.use('*', logger())

const prefix = (env.local_path_prefix ?? '').replace(/\/+$/, '')
if (prefix) {
  app.use(`${prefix}/*`, (c, next) => {
    c.set('path_prefix', prefix)
    return next()
  })

  app.route(prefix, routes)
} else {
  app.route('/', routes)
}

serve({ fetch: app.fetch, port: 12000 }, (info) => {
  consola.info(`Server listening on port ${info.port}`)
})
