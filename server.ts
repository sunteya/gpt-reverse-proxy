import { serve } from '@hono/node-server'
import consola from 'consola'
import { Hono } from 'hono'
import * as fs from 'fs'
import * as yaml from 'js-yaml'
import { createHandler } from './endpoints'
import { UpstreamSettings } from './endpoints/types'
import { HookRegistry } from './lib/HookRegistry'
import { Dumper, generateDumpFilePath } from './lib/dumper'
import { UpstreamRegistry } from './lib/UpstreamRegistry'

consola.level = 4

interface Endpoint {
  prefix: string
  type: string
  group: string | undefined
  hooks?: string[]
}

interface Config {
  endpoints: Endpoint[]
  upstreams: UpstreamSettings[]
}

function loadConfig(): Config {
  try {
    const configContent = fs.readFileSync('config.yml', 'utf8')
    return yaml.load(configContent) as Config
  } catch (error) {
    consola.error('Failed to load config.yml:', error)
    process.exit(1)
  }
}

const config = loadConfig()
consola.info(`Loaded ${config.endpoints.length} endpoints from config.yml`)

// Load all hooks at startup
const hooks = new HookRegistry()
hooks.loadAllHooks().then(() => {
  const loadedHooks = hooks.listHooks()
  if (loadedHooks.length > 0) {
    consola.info(`Loaded ${loadedHooks.length} hooks: ${loadedHooks.join(', ')}`)
  }
})

const app = new Hono()
app.use('*', (c, next) => {
  consola.info(`url: ${c.req.method} ${c.req.url}`)

  const dumpFilePath = generateDumpFilePath(c.req.path)
  consola.info(`Dumping to ${dumpFilePath}`)
  const dumper = new Dumper(dumpFilePath)
  c.set('dumper', dumper)

  return next()
})

for (const endpoint of config.endpoints) {
  consola.info(`Setting up ${endpoint.type} routes for ${endpoint.prefix} (group: ${endpoint.group})`)

  // Create endpoint settings
  const settings = {
    prefix: endpoint.prefix,
    type: endpoint.type,
    group: endpoint.group,
    hooks: endpoint.hooks
  }

  const upstreams = new UpstreamRegistry(config.upstreams, endpoint.group)

  // Create endpoint handler with settings
  const handler = createHandler(endpoint.type, settings, upstreams, hooks)
  if (!handler) {
    consola.warn(`Unknown endpoint type: ${endpoint.type} for ${endpoint.prefix}`)
    continue
  }

  handler.setupEndpointRoutes(app)
}

const port = process.env.PORT ? parseInt(process.env.PORT) : 12000

serve({ fetch: app.fetch, port }, (info) => {
  consola.info(`Server listening on port ${info.port}`)
  consola.info(`Loaded ${config.upstreams.length} upstreams:`)
  for (const upstream of config.upstreams) {
    consola.info(`  ${upstream.name} (groups: ${upstream.groups?.join(', ')}) -> ${upstream.api_base}`)
  }
  consola.info(`Configured ${config.endpoints.length} endpoints:`)
  for (const endpoint of config.endpoints) {
    consola.info(`  ${endpoint.prefix} (${endpoint.type}, group: ${endpoint.group})`)
  }
})
