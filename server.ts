import { serve } from '@hono/node-server'
import consola, { LogLevel } from 'consola'
import { Hono } from 'hono'
import _ from 'lodash'
import { logger } from './lib/logger'
import { proxy } from './lib/proxy'
import { registerOllamaRoutes } from './lib/route-ollama'
import { registerOpenAIRoutes } from './lib/route-openai'
import { stripPrefix } from './lib/utils'

import env from './boot'

consola.level = LogLevel[_.capitalize(env.log_level) as keyof typeof LogLevel]
consola.info("env is", env)

const upstream = proxy({
  upstream_url: env.upstream_url,
  upstream_authorization: env.upstream_authorization,
  https_proxy: env.https_proxy,
})

const routes = new Hono()
registerOllamaRoutes(routes, upstream, env.local_ollama_secret)
registerOpenAIRoutes(routes, upstream, env.local_auth_token)

const app = new Hono()
app.use('*', logger())

const prefix = (env.local_path_prefix ?? '').replace(/\/+$/, '')
if (prefix) {
  app.use(`${prefix}/*`, (c, next) => {
    const requestUrl = new URL(c.req.url)
    const strippedPath = stripPrefix(requestUrl.pathname, prefix)
    c.set('rewrite_path', strippedPath)
    return next()
  })

  app.route(prefix, routes)
} else {
  app.route('/', routes)
}

serve({ fetch: app.fetch, port: 12000 }, (info) => {
  consola.info(`Server listening on port ${info.port}`)
})
