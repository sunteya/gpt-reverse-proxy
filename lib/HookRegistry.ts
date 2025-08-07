import * as path from 'path'
import * as fs from 'fs'
import consola from 'consola'
import { Hook } from './Hook'

export class HookRegistry {
  patches: Map<string, Hook> = new Map()

  async loadAllHooks() {
    const patchesDir = path.join(process.cwd(), 'patches')

    if (!fs.existsSync(patchesDir)) {
      consola.info('Patches directory not found, creating it...')
      fs.mkdirSync(patchesDir, { recursive: true })
      return
    }

    const files = fs.readdirSync(patchesDir)
    const tsFiles = files.filter(file => file.endsWith('.ts'))

    for (const file of tsFiles) {
      const patchName = path.basename(file, '.ts')
      try {
        const patchPath = path.join(patchesDir, file)
        const patchModule = await import(patchPath)
        const patch: Hook = patchModule.default || patchModule

        // Ensure it's a Hook instance
        if (patch instanceof Hook) {
          this.patches.set(patchName, patch)
          consola.info(`Loaded patch: ${patchName}`)
        } else {
          consola.warn(`Patch ${patchName} is not a Hook instance, skipping`)
        }
      } catch (error) {
        consola.error(`Failed to load patch ${patchName}:`, error)
      }
    }
  }

  getHook(name: string): Hook | undefined {
    return this.patches.get(name)
  }

  getHooks(names: string[]): Hook[] {
    return names.map(name => this.getHook(name)).filter(patch => patch !== undefined) as Hook[]
  }

  listHooks(): string[] {
    return Array.from(this.patches.keys())
  }
}
