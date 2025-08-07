import { MessageCreateParamsBase as ClaudeCompletionParams } from '@anthropic-ai/sdk/resources/messages'
import { ChatCompletionCreateParamsBase as OpenAICompletionParams } from 'openai/resources/chat/completions'
import { ValuesType } from 'utility-types'

function convertToolsToClaudeFormat(openaiTools: any[]): any[] {
  return openaiTools.map(tool => {
    if (tool.type === 'function' && tool.function) {
      return {
        name: tool.function.name,
        description: tool.function.description,
        input_schema: tool.function.parameters
      }
    }
    return tool
  })
}

export function completionOpenAIToClaude(openaiRequest: OpenAICompletionParams): ClaudeCompletionParams {
  const claudeRequest: Partial<ClaudeCompletionParams> = {
    model: openaiRequest.model,
    messages: []
  }

  // Handle system message from OpenAI format (from messages array only)
  const systemMessages = openaiRequest.messages.filter(m => m.role === 'system')
  if (systemMessages.length > 0) {
    claudeRequest.system = systemMessages.map(msg => {
      if (typeof msg.content === 'string') {
        return { type: 'text', text: msg.content }
      } else if (Array.isArray(msg.content)) {
        // Handle content array format
        const textContent = msg.content.find(item => item.type === 'text')
        return { type: 'text', text: textContent?.text || '' }
      }
      return { type: 'text', text: '' }
    })
  } else {
    // Add Claude Code compatible system message if none exists
    claudeRequest.system = [
      {
        type: 'text',
        text: 'You are Claude Code, Anthropic\'s official CLI for Claude.',
        cache_control: { type: 'ephemeral' }
      }
    ]
  }

  // Convert non-system messages
  for (const message of openaiRequest.messages) {
    if (message.role === 'system') continue // Skip system messages

    const claudeMessage: ValuesType<ClaudeCompletionParams['messages']> = {
      role: message.role === 'user' ? 'user' : 'assistant',
      content: []
    }

    if (typeof message.content === 'string') {
      claudeMessage.content = [{
        type: 'text',
        text: message.content
      }]
    } else if (Array.isArray(message.content)) {
      // Convert OpenAI content parts to Claude format
      claudeMessage.content = message.content.map(part => {
        if (part.type === 'text') {
          return {
            type: 'text',
            text: part.text
          }
        }
        // For other types, convert to text for now
        return {
          type: 'text',
          text: `[${part.type} content]`
        }
      })
    }

    claudeRequest.messages!.push(claudeMessage)
  }

  // Copy other properties
  if (openaiRequest.temperature !== undefined && openaiRequest.temperature !== null) {
    claudeRequest.temperature = openaiRequest.temperature
  }
  if (openaiRequest.max_tokens !== undefined && openaiRequest.max_tokens !== null) {
    claudeRequest.max_tokens = openaiRequest.max_tokens
  }
  if (openaiRequest.tools) claudeRequest.tools = convertToolsToClaudeFormat(openaiRequest.tools)
  if (openaiRequest.stream !== undefined && openaiRequest.stream !== null) {
    claudeRequest.stream = openaiRequest.stream
  }

  return claudeRequest as ClaudeCompletionParams
}
