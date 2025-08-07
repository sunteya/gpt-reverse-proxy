import * as path from 'path'
import * as fs from 'fs'
import consola from 'consola'
import { Hook } from './Hook'

export class HookRegistry {
  mapping: Map<string, Hook> = new Map()

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
        const hook: Hook = hookModule.default || hookModule

        if (hook instanceof Hook) {
          this.mapping.set(hookName, hook)
          consola.info(`Loaded hook: ${hookName}`)
        } else {
          consola.warn(`Hook ${hookName} is not a Hook instance, skipping`)
        }
      } catch (error) {
        consola.error(`Failed to load hook ${hookName}:`, error)
      }
    }
  }

  getHook(name: string): Hook | undefined {
    return this.mapping.get(name)
  }

  getHooks(names: string[]): Hook[] {
    return names.map(name => this.getHook(name)).filter(patch => patch !== undefined) as Hook[]
  }

  listHooks(): string[] {
    return Array.from(this.mapping.keys())
  }
}
