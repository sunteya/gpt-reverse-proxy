import { serve } from '@hono/node-server'
import consola, { LogLevel } from 'consola'
import { Hono } from 'hono'
import * as fs from 'fs'
import * as yaml from 'js-yaml'
import { createHandler } from './endpoints'
import { Upstream } from './endpoints/types'
import { hookRegistry } from './lib/hookRegistry'

consola.level = LogLevel.Debug

interface Endpoint {
  prefix: string
  type: string
  group: string | undefined
  hooks?: string[]
}

interface Config {
  endpoints: Endpoint[]
  upstreams: Upstream[]
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

function findUpstreamForGroup(upstreams: Upstream[], group: string | undefined): Upstream | null {
  for (const upstream of upstreams) {
    if (upstream.groups == undefined) {
      return upstream
    }

    if (group == undefined) {
      return upstream
    }

    if (upstream.groups.includes(group)) {
      return upstream
    }
  }

  return null
}

const config = loadConfig()
consola.info(`Loaded ${config.endpoints.length} endpoints from config.yml`)

// Load all hooks at startup
hookRegistry.loadAllHooks().then(() => {
  const loadedHooks = hookRegistry.listHooks()
  if (loadedHooks.length > 0) {
    consola.info(`Loaded ${loadedHooks.length} hooks: ${loadedHooks.join(', ')}`)
  }
})

const app = new Hono()
// app.use('*', logger())

for (const endpoint of config.endpoints) {
  consola.info(`Setting up ${endpoint.type} routes for ${endpoint.prefix} (group: ${endpoint.group})`)

  // Create endpoint settings
  const settings = {
    prefix: endpoint.prefix,
    type: endpoint.type,
    group: endpoint.group,
    hooks: endpoint.hooks
  }

  // Create a function that dynamically finds upstream for any group
  const upstreamGetter = (group?: string) => {
    const targetGroup = group || endpoint.group
    return findUpstreamForGroup(config.upstreams, targetGroup)
  }

  // Create endpoint handler with settings
  const handler = createHandler(endpoint.type, settings, upstreamGetter)
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