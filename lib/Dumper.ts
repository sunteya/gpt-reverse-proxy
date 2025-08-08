import { MiddlewareHandler } from 'hono'
import fs from 'fs'
import path from 'path'
import dayjs from 'dayjs'

export function generateDumpFilePath(requestPath: string): string {
  let cleanPath = requestPath.split('?')[0].replace(/[<>:"|*?]/g, '_')

  if (cleanPath.startsWith('/')) {
    cleanPath = cleanPath.substring(1)
  }
  if (cleanPath.endsWith('/')) {
    cleanPath = cleanPath.slice(0, -1)
  }
  cleanPath = cleanPath || 'root'

  const dumpDir = path.join('log', ...cleanPath.split('/').filter(p => p))
  fs.mkdirSync(dumpDir, { recursive: true })

  const fileTimestamp = dayjs().format('YYYYMMDDHHmmssSSS')
  return path.join(dumpDir, `${fileTimestamp}.jsonl`)
}

export class Dumper {
  filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath
  }

  public dump(leg: 'user' | 'upstream' | null, direction: 'request' | 'response', event: string, payload: Record<string, any>) {
    const dumpEntry = {
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss.SSS'),
      leg,
      direction,
      event,
      payload,
    }

    // console.log(event, dumpEntry)
    fs.appendFileSync(this.filePath, JSON.stringify(dumpEntry) + '\n')
  }
}
