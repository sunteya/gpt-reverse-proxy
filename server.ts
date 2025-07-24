import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import _ from 'lodash'
import consola, { LogLevel } from 'consola'
import { logger } from './lib/logger'
import { proxy } from './lib/proxy'

import env from './boot'

consola.level = LogLevel[_.capitalize(env.log_level)]
consola.info("env is", env)

const upstream = proxy({
  upstream_url: env.upstream_url,
  upstream_authorization: env.upstream_authorization,
  https_proxy: env.https_proxy,
})

const routes = new Hono()
routes.post('/v1/chat/completions', async (c) => {
  const response = await upstream(c, async () => {})

  if (!response) {
    return c.text('Proxy middleware failed to return a response.', 500)
  }

  if (!response.body) {
    return response
  }

  const { readable, writable } = new TransformStream({
    transform(chunk, controller) {
      const modifiedChunk = Buffer.from(chunk)
        .toString('utf-8')
        .replace(/,"finish_reason":null/g, '')
        .replace(/,"usage":null/g, '')
      controller.enqueue(new TextEncoder().encode(modifiedChunk))
    },
  })

  response.body.pipeTo(writable)
  return new Response(readable, response)
})

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
