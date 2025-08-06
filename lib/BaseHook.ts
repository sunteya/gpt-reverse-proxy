import consola from 'consola'

export abstract class BaseHook {
  name: string

  // Common utility functions that all hooks can use
  protected log(message: string, data?: any) {
    consola.info(`[Hook:${this.name}] ${message}`, data)
  }

  protected debug(message: string, data?: any) {
    consola.debug(`[Hook:${this.name}] ${message}`, data)
  }

  protected error(message: string, error?: any) {
    consola.error(`[Hook:${this.name}] ${message}`, error)
  }

  protected warn(message: string, data?: any) {
    consola.warn(`[Hook:${this.name}] ${message}`, data)
  }

  // Helper function to check content type
  protected isJsonContent(response: Response): boolean {
    const contentType = response.headers.get('content-type') || ''
    return contentType.includes('application/json')
  }

  // Helper function to check if it's a streaming response
  protected isStreamingResponse(response: Response): boolean {
    const contentType = response.headers.get('content-type') || ''
    return contentType.includes('text/event-stream') || 
           contentType.includes('application/stream') ||
           response.headers.get('transfer-encoding') === 'chunked'
  }

  async onRequest(request: Request) {
    return request
  }

  async onResponse(response: Response, request: Request) {
    return response
  }
}