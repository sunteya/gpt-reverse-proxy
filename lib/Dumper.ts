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

    console.log(event, dumpEntry)
    fs.appendFileSync(this.filePath, JSON.stringify(dumpEntry) + '\n')
  }
}

// export const dumper = (): MiddlewareHandler => {
//   return async (c, next) => {
//     const dumpFile = generateDumpFilePath(c.req.path)
//     const dumper = new Dumper(dumpFile)
//
//     const requestHeaders: Record<string, string> = {};
//     for (const [key, value] of Object.entries(c.req.header())) {
//       requestHeaders[key] = value;
//     }
//
//     dumper.dump('request_start', {
//       method: c.req.method,
//       url: c.req.url,
//       headers: requestHeaders
//     });
//
//     if (c.req.raw.body) {
//       const clonedReq = c.req.raw.clone();
//       (async () => {
//         try {
//           const reader = clonedReq.body?.getReader();
//           if (!reader) return;
//           let chunkIndex = 0;
//           while (true) {
//             const { done, value } = await reader.read();
//             if (done) {
//               dumper.dump('request_body_complete', {});
//               break;
//             }
//             dumper.dump('request_chunk', {
//               chunk_index: chunkIndex++,
//               data: Buffer.from(value).toString('utf8')
//             });
//           }
//         } catch (e: any) {
//           dumper.dump('error', { context: 'Failed to dump request body', message: e.message, stack: e.stack });
//         }
//       })();
//     }
//
//     await next()
//
//     const originalRes = c.res.clone();
//     const statusText = originalRes.statusText || ''
//
//     const responseHeaders: Record<string, string> = {};
//     for (const [key, value] of originalRes.headers.entries()) {
//       responseHeaders[key] = value;
//     }
//
//     dumper.dump('response_start', {
//       status: originalRes.status,
//       status_text: statusText,
//       headers: responseHeaders
//     });
//
//     if (c.res.body) {
//       const [dumpStream, clientStream] = c.res.body.tee();
//
//       (async () => {
//         try {
//           const reader = dumpStream.getReader();
//           let chunkIndex = 0;
//           while (true) {
//             const { done, value } = await reader.read();
//             if (done) {
//               dumper.dump('response_body_complete', {});
//               break;
//             }
//             dumper.dump('response_chunk', {
//               chunk_index: chunkIndex++,
//               data: Buffer.from(value).toString('utf8')
//             });
//           }
//         } catch (e: any) {
//             dumper.dump('error', { context: 'Failed to dump response body', message: e.message, stack: e.stack });
//         }
//       })();
//
//       c.res = new Response(clientStream, c.res);
//     }
//   }
// }
