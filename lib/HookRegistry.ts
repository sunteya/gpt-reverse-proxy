import * as path from 'path'
import * as fs from 'fs'
import consola from 'consola'
import { Hook } from './Hook'
import { normalizePlugins } from '../lib/utils'

type HookClass = new (config: any) => Hook<any>

export class HookRegistry {
  mapping: Map<string, HookClass> = new Map()

  async loadFromDirectory(root: string, folder: string) {
    const directory = path.join(root, folder)
    if (!fs.existsSync(directory)) {
      consola.warn(`Directory not found, skipping: ${directory}`)
      return
    }

    const files = fs.readdirSync(directory).filter(file => file.endsWith('.ts'))
    consola.info(`Found ${files.length} hooks in ${directory}`)

    for (const file of files) {
      const hookPath = path.join(directory, file)
      const hookName = path.join(folder, path.basename(file, '.ts'))
      try {
        const hookModule = await import(hookPath)
        const HookClass = hookModule.default || hookModule

        if (HookClass && HookClass.prototype instanceof Hook) {
          this.mapping.set(hookName, HookClass)
          consola.info(`Loaded hook class: ${hookName}`)
        } else {
          consola.warn(`Hook ${hookName} is not a Hook class, skipping`)
        }
      } catch (error) {
        consola.error(`Failed to load hook ${hookName}:`, error)
      }
    }
  }

  getHookClass(name: string): HookClass | undefined {
    return this.mapping.get(name)
  }

  buildHooks(rawPlugins: string[] | Record<string, any> | undefined): Hook[] {
    const plugins = normalizePlugins(rawPlugins)
    return Object.entries(plugins)
      .map(([name, config]) => {
        const HookClass = this.getHookClass(name)
        if (!HookClass) {
          consola.warn(`Hook class not found: ${name}`)
          return undefined
        }
        return new HookClass(config)
      })
      .filter(v => v) as Hook[]
  }

  listHooks(): string[] {
    return Array.from(this.mapping.keys())
  }
}
