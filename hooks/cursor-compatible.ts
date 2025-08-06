import { BaseHook } from '../lib/BaseHook'

// Cursor compatibility hook
// Fix finish_reason null values in streaming responses for Cursor editor compatibility

class CursorCompatibleHook extends BaseHook {
  name = 'cursor-compatible'

  async onResponse(response: Response, request: Request) {
    // Only process /v1/chat/completions streaming responses
    if (!request.url.includes('/v1/chat/completions') || !this.isStreamingResponse(response)) {
      return response
    }

    // Process streaming response and fix finish_reason null values
    const originalStream = response.body
    if (!originalStream) {
      return response
    }

    const reader = originalStream.getReader()
    const decoder = new TextDecoder()
    const encoder = new TextEncoder()
    const fixStreamingChunks = this.fixStreamingChunks.bind(this)
    
    const stream = new ReadableStream({
      async start(controller) {
        async function pump(): Promise<void> {
          const { done, value } = await reader.read()
          if (done) {
            controller.close()
            return
          }
          
          // Decode chunk and process it
          const chunk = decoder.decode(value, { stream: true })
          const processedChunk = fixStreamingChunks(chunk)
          
          // Encode and enqueue the processed chunk
          controller.enqueue(encoder.encode(processedChunk))
          
          return pump()
        }
        return pump()
      }
    })
    
    return new Response(stream, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    })
  }

  private fixStreamingChunks(chunk: string): string {
    // Split by lines and process each data line
    const lines = chunk.split('\n')
    const processedLines = lines.map(line => {
      if (line.startsWith('data: ') && line !== 'data: [DONE]') {
        try {
          const jsonStr = line.substring(6) // Remove 'data: ' prefix
          const data = JSON.parse(jsonStr)
          
          // Fix finish_reason null values
          if (data.choices && Array.isArray(data.choices)) {
            data.choices = data.choices.map((choice: any) => {
              if (choice.finish_reason === null) {
                choice.finish_reason = ''
              }
              return choice
            })
          }
          
          return 'data: ' + JSON.stringify(data)
        } catch (error) {
          this.debug('Failed to parse streaming chunk:', error)
          return line
        }
      }
      return line
    })
    
    return processedLines.join('\n')
  }
}

// Export instance
export default new CursorCompatibleHook()