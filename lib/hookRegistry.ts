import * as path from 'path'
import * as fs from 'fs'
import consola from 'consola'
import { BaseHook } from './BaseHook'

class HookRegistry {
  private hooks: Map<string, BaseHook> = new Map()

  async loadAllHooks() {
    const hooksDir = path.join(process.cwd(), 'hooks')
    
    if (!fs.existsSync(hooksDir)) {
      consola.info('Hooks directory not found, creating it...')
      fs.mkdirSync(hooksDir, { recursive: true })
      return
    }

    const files = fs.readdirSync(hooksDir)
    const tsFiles = files.filter(file => file.endsWith('.ts'))

    for (const file of tsFiles) {
      const hookName = path.basename(file, '.ts')
      try {
        const hookPath = path.join(hooksDir, file)
        const hookModule = await import(hookPath)
        const hook: BaseHook = hookModule.default || hookModule
        
        // Ensure it's a BaseHook instance
        if (hook instanceof BaseHook) {
          this.hooks.set(hookName, hook)
          consola.info(`Loaded hook: ${hookName}`)
        } else {
          consola.warn(`Hook ${hookName} is not a BaseHook instance, skipping`)
        }
      } catch (error) {
        consola.error(`Failed to load hook ${hookName}:`, error)
      }
    }
  }

  getHook(name: string): BaseHook | undefined {
    return this.hooks.get(name)
  }

  getHooks(names: string[]): BaseHook[] {
    return names.map(name => this.getHook(name)).filter(hook => hook !== undefined) as BaseHook[]
  }

  listHooks(): string[] {
    return Array.from(this.hooks.keys())
  }
}

export const hookRegistry = new HookRegistry()