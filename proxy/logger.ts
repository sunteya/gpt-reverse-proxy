import { MiddlewareHandler } from 'hono'
import fs from 'fs'
import path from 'path'
import dayjs from 'dayjs'
import consola, { LogLevel } from 'consola'

function generateLogFilePath(requestPath: string): string {
  let cleanPath = requestPath.split('?')[0].replace(/[<>:"|*?]/g, '_')

  if (cleanPath.startsWith('/')) {
    cleanPath = cleanPath.substring(1)
  }
  if (cleanPath.endsWith('/')) {
    cleanPath = cleanPath.slice(0, -1)
  }
  cleanPath = cleanPath || 'root'

  const logDir = path.join('log', ...cleanPath.split('/').filter(p => p))
  fs.mkdirSync(logDir, { recursive: true })

  const fileTimestamp = dayjs().format('YYYYMMDDHHmmssSSS')
  return path.join(logDir, `${fileTimestamp}.jsonl`)
}

function logRequestChunk(logFile: string, chunkIndex: number, chunk: Buffer) {
  const logEntry = {
    timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss.SSS'),
    type: 'request_chunk',
    chunk_index: chunkIndex,
    data: chunk.toString('utf8')
  };
  fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
}

function logResponseChunk(logFile: string, chunkIndex: number, chunk: Buffer) {
  const logEntry = {
    timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss.SSS'),
    type: 'response_chunk',
    chunk_index: chunkIndex,
    data: chunk.toString('utf8')
  };
  fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
}

export const logger = (): MiddlewareHandler => {
  return async (c, next) => {
    consola.info(`${c.req.method} ${c.req.url}`)

    const logFile = generateLogFilePath(c.req.path)
    consola.info(`Request start logged to: ${logFile}`)

    const requestHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(c.req.header())) {
      requestHeaders[key] = value;
    }
    
    const requestLogEntry = {
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss.SSS'),
      type: 'request_start',
      method: c.req.method,
      url: c.req.url,
      headers: requestHeaders
    };
    fs.appendFileSync(logFile, JSON.stringify(requestLogEntry) + '\n');

    if (c.req.raw.body) {
      const clonedReq = c.req.raw.clone();
      (async () => {
        try {
          const reader = clonedReq.body?.getReader();
          if (!reader) return;
          let chunkIndex = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              const completeLogEntry = {
                timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss.SSS'),
                type: 'request_body_complete'
              };
              fs.appendFileSync(logFile, JSON.stringify(completeLogEntry) + '\n');
              break;
            }
            logRequestChunk(logFile, chunkIndex++, Buffer.from(value));
          }
        } catch (e) {
          consola.error('Failed to log request body', e);
        }
      })();
    }

    await next()

    const originalRes = c.res.clone();
    const statusText = originalRes.statusText || ''
    
    const responseHeaders: Record<string, string> = {};
    for (const [key, value] of originalRes.headers.entries()) {
      responseHeaders[key] = value;
    }
    
    const responseLogEntry = {
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss.SSS'),
      type: 'response_start',
      status: originalRes.status,
      status_text: statusText,
      headers: responseHeaders
    };
    fs.appendFileSync(logFile, JSON.stringify(responseLogEntry) + '\n');

    if (c.res.body) {
      const [logStream, clientStream] = c.res.body.tee();

      (async () => {
        try {
          const reader = logStream.getReader();
          let chunkIndex = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              const completeLogEntry = {
                timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss.SSS'),
                type: 'response_body_complete'
              };
              fs.appendFileSync(logFile, JSON.stringify(completeLogEntry) + '\n');
              break;
            }
            logResponseChunk(logFile, chunkIndex++, Buffer.from(value));
          }
        } catch (e) {
          consola.error('Failed to log response body', e);
        }
      })();

      c.res = new Response(clientStream, c.res);
    }
  }
}
