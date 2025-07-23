
import http from 'http'
import { PassThrough } from 'stream'
import fs from 'fs'
import path from 'path'
import consola from 'consola'
import dayjs from 'dayjs'

// --- Helper Functions ---

function generateLogFilePath(requestPath: string): string {
  const cleanPath = requestPath.split('?')[0].replace(/[<>:"|*?]/g, '_').replace(/\/$/, '') || 'root'
  const logDir = path.join('log', ...cleanPath.split('/').filter(p => p))
  fs.mkdirSync(logDir, { recursive: true })

  const fileTimestamp = dayjs().format('YYYYMMDDHHmmssSSS')
  return path.join(logDir, `${fileTimestamp}.txt`)
}

// --- Internal Logging Functions ---

function logRequestStart(logFile: string, requestPath: string, method: string, headers: http.IncomingHttpHeaders, httpVersion: string) {
  try {
    const logTimestamp = dayjs().format('YYYY-MM-DD HH:mm:ss.SSS')
    let content = `==== REQUEST [${logTimestamp}] ====\r\n`
    content += `${method} ${requestPath} HTTP/${httpVersion}\r\n`
    for (const [key, value] of Object.entries(headers)) {
      content += `${key}: ${value}\r\n`
    }
    content += '\r\n'

    const isStreaming = headers['transfer-encoding'] === 'chunked' ||
      headers['content-type']?.includes('stream') ||
      !headers['content-length']

    if (isStreaming) {
      content += '[STREAMING REQUEST - Body will be logged as chunks]\r\n'
    }
    content += '\r\n'

    fs.writeFileSync(logFile, content)
    consola.debug(`Request start logged to: ${logFile}`)
  } catch (error) {
    consola.error('Failed to log request start:', error)
  }
}

function logRequestChunk(logFile: string, chunkIndex: number, chunk: Buffer) {
  try {
    const logTimestamp = dayjs().format('YYYY-MM-DD HH:mm:ss.SSS')
    let content = `==== REQUEST CHUNK - ${chunkIndex} [${logTimestamp}] ====\r\n`
    content += chunk.toString('utf8')
    content += '\r\n\r\n'
    fs.appendFileSync(logFile, content)
    consola.debug(`Request chunk ${chunkIndex} logged to: ${logFile}`)
  } catch (error) {
    consola.error('Failed to log request chunk:', error)
  }
}

function logRequestComplete(logFile: string, chunkCount: number) {
  try {
    if (chunkCount > 0) {
      fs.appendFileSync(logFile, `==== REQUEST BODY COMPLETE (${chunkCount} chunks) ====\r\n\r\n`)
    }
  } catch (error) {
    consola.error('Failed to log request complete:', error)
  }
}

function logResponse(logFile: string, statusCode: number | undefined, headers: http.OutgoingHttpHeaders, httpVersion: string) {
  try {
    if (!logFile) return
    const logTimestamp = dayjs().format('YYYY-MM-DD HH:mm:ss.SSS')
    let content = `==== RESPONSE [${logTimestamp}] ====\r\n`
    content += `HTTP/${httpVersion} ${statusCode}\r\n`
    for (const [key, value] of Object.entries(headers)) {
      const headerValue = Array.isArray(value) ? value.join('; ') : value
      content += `${key}: ${headerValue}\r\n`
    }
    content += '\r\n\r\n'

    fs.appendFileSync(logFile, content)
    consola.debug(`Response logged to: ${logFile}`)
  } catch (error) {
    consola.error('Failed to log response:', error)
  }
}

function logResponseChunk(logFile: string, chunkIndex: number, chunk: Buffer) {
  try {
    if (!logFile) return
    const logTimestamp = dayjs().format('YYYY-MM-DD HH:mm:ss.SSS')
    let content = `==== CHUNK - ${chunkIndex} [${logTimestamp}] ====\r\n`
    content += chunk.toString('utf8')
    content += '\r\n\r\n'
    fs.appendFileSync(logFile, content)
    consola.debug(`Stream chunk ${chunkIndex} logged to: ${logFile}`)
  } catch (error) {
    consola.error('Failed to log stream chunk:', error)
  }
}

export function logRequest(req: http.IncomingMessage, res: http.ServerResponse): http.IncomingMessage {
  const requestPath = req.url || ''
  const logFile = generateLogFilePath(requestPath)

  logRequestStart(logFile, requestPath, req.method || 'UNKNOWN', req.headers, req.httpVersion)

  const wrappedReq = new PassThrough()

  const reqAsAny = wrappedReq as any
  reqAsAny.headers = req.headers
  reqAsAny.httpVersion = req.httpVersion
  reqAsAny.method = req.method
  reqAsAny.url = req.url

  let chunkIndex = 0
  req.on('data', (chunk) => {
    logRequestChunk(logFile, chunkIndex++, chunk)
    wrappedReq.write(chunk)
  })

  req.on('end', () => {
    logRequestComplete(logFile, chunkIndex)
    wrappedReq.end()
  })

  req.on('error', (err) => {
    consola.error('Error on incoming request stream:', err)
    wrappedReq.emit('error', err)
  })

  let responseChunkIndex = 0

  const originalWrite = res.write.bind(res)
  res.write = function(chunk: any, encoding?: any, callback?: any): boolean {
    if (!res.headersSent) {
      logResponse(logFile, res.statusCode, res.getHeaders(), req.httpVersion)
    }
    if (chunk) {
      logResponseChunk(logFile, responseChunkIndex++, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return originalWrite(chunk, encoding, callback)
  }

  const originalEnd = res.end.bind(res)
  res.end = function(chunk?: any, encoding?: any, callback?: any) {
    if (!res.headersSent) {
      logResponse(logFile, res.statusCode, res.getHeaders(), req.httpVersion)
    }
    if (chunk && typeof chunk !== 'function') {
      logResponseChunk(logFile, responseChunkIndex++, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return originalEnd(chunk, encoding, callback)
  }

  return wrappedReq as unknown as http.IncomingMessage
}