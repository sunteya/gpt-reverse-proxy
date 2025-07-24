import { MiddlewareHandler } from 'hono'
import fs from 'fs'
import path from 'path'
import dayjs from 'dayjs'
import consola from 'consola'

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
  return path.join(logDir, `${fileTimestamp}.txt`)
}

function logRequestChunk(logFile: string, chunkIndex: number, chunk: Buffer) {
  const logTimestamp = dayjs().format('YYYY-MM-DD HH:mm:ss.SSS');
  const content = [
    `==== REQUEST CHUNK - ${chunkIndex} [${logTimestamp}] ====`,
    chunk.toString('utf8'),
    ''
  ].join('\n');
  fs.appendFileSync(logFile, content);
}

function logResponseChunk(logFile: string, chunkIndex: number, chunk: Buffer) {
    const logTimestamp = dayjs().format('YYYY-MM-DD HH:mm:ss.SSS');
    const content = [
      `==== RESPONSE CHUNK - ${chunkIndex} [${logTimestamp}] ====`,
      chunk.toString('utf8'),
      ''
    ].join('\n');
    fs.appendFileSync(logFile, content);
  }

export const logger = (): MiddlewareHandler => {
  return async (c, next) => {
    const logFile = generateLogFilePath(c.req.path)
    consola.info(`Request start logged to: ${logFile}`)

    const requestLogParts = [
      `==== REQUEST [${dayjs().format('YYYY-MM-DD HH:mm:ss.SSS')}] ====`,
      `${c.req.method} ${c.req.url}`
    ];
    for (const [key, value] of Object.entries(c.req.header())) {
      requestLogParts.push(`${key}: ${value}`);
    }
    fs.appendFileSync(logFile, requestLogParts.join('\n') + '\n\n');

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
              fs.appendFileSync(logFile, `==== REQUEST BODY COMPLETE ====\n\n`);
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
    const responseLogParts = [
      `==== RESPONSE [${dayjs().format('YYYY-MM-DD HH:mm:ss.SSS')}] ====`,
      `HTTP/1.1 ${originalRes.status} ${statusText}`
    ];
    for (const [key, value] of originalRes.headers.entries()) {
      responseLogParts.push(`${key}: ${value}`);
    }
    fs.appendFileSync(logFile, responseLogParts.join('\n') + '\n\n');

    if (c.res.body) {
      const [logStream, clientStream] = c.res.body.tee();

      (async () => {
        try {
          const reader = logStream.getReader();
          let chunkIndex = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              fs.appendFileSync(logFile, `==== RESPONSE BODY COMPLETE ====\n\n`);
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
