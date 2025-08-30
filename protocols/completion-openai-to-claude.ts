import { Anthropic } from '@anthropic-ai/sdk/client'
import OpenAI from 'openai'
import { MessageCreateParamsBase as ClaudeCompletionParams } from '@anthropic-ai/sdk/resources/messages'
import { ChatCompletionChunk, ChatCompletionCreateParamsBase as OpenAICompletionParams } from 'openai/resources/chat/completions'
import { ValuesType } from 'utility-types'
import { EventSourceMessage } from 'eventsource-parser'

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

export function openaiCompletionRequestToClaude(openaiRequest: OpenAICompletionParams): ClaudeCompletionParams {
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

export function claudeMessageResponseToOpenAI(message: Anthropic.Messages.Message): OpenAI.Chat.Completions.ChatCompletion {
  const finishReasonMapping = {
    'end_turn': 'stop',
    'max_tokens': 'length',
    'tool_use': 'tool_calls',
    'stop_sequence': 'stop',
    'pause_turn': 'stop',
    'refusal': 'stop',
  } satisfies Record<NonNullable<Anthropic.Messages.Message['stop_reason']>, OpenAI.Chat.Completions.ChatCompletion.Choice['finish_reason']>

  const choice: OpenAI.Chat.Completions.ChatCompletion.Choice = {
    index: 0,
    message: { role: 'assistant', content: null, refusal: null },
    logprobs: null,
    finish_reason: finishReasonMapping[message.stop_reason ?? 'end_turn']
  }

  const textBlocks = message.content.filter((c): c is Anthropic.Messages.TextBlock => c.type === 'text')
  if (textBlocks.length > 0) {
    choice.message.content = textBlocks.map(c => c.text).join('')
  }

  const toolUseBlocks = message.content.filter((c): c is Anthropic.Messages.ToolUseBlock => c.type === 'tool_use')
  if (toolUseBlocks.length > 0) {
    choice.message.tool_calls = toolUseBlocks.map(toolUse => ({
      id: toolUse.id,
      type: 'function',
      function: {
        name: toolUse.name,
        arguments: JSON.stringify(toolUse.input)
      }
    }))
  }

  return {
    id: `chatcmpl-${message.id}`,
    choices: [choice],
    created: Math.floor(Date.now() / 1000),
    model: message.model,
    object: 'chat.completion',
    usage: {
      prompt_tokens: message.usage.input_tokens,
      completion_tokens: message.usage.output_tokens,
      total_tokens: message.usage.input_tokens + message.usage.output_tokens
    }
  }
}

export class ClaudeToOpenAIStream extends TransformStream<EventSourceMessage, EventSourceMessage> {
  id: string | null = null
  model: string | null = null
  toolCallChunks: Record<number, any> = {}

  constructor() {
    super({
      transform: (chunk, controller) => {
        this.handleTransform(chunk, controller)
      }
    })
  }

  handleTransform(source: EventSourceMessage, controller: TransformStreamDefaultController<EventSourceMessage>) {
    if (source.data === '[DONE]') {
      controller.enqueue(source)
      controller.terminate()
      return
    }

    if (!source.event) {
      return
    }

    if (source.event === 'message_stop') {
      controller.enqueue({ id: source.id, data: '[DONE]' })
      controller.terminate()
      return
    }

    if (!source.data || source.data.trim() === '') {
      return
    }

    let json: Anthropic.MessageStreamEvent
    try {
      json = JSON.parse(source.data)
    } catch (e) {
      // Not a JSON object, probably a ping or something else we can ignore
      return
    }

    if (json.type === 'message_start') {
      const { message } = json as Anthropic.Messages.MessageStartEvent
      this.id = `chatcmpl-${message.id}`
      this.model = message.model
    } else if (!this.id || !this.model) {
      // We haven't received the message_start event yet, so we can't process this event.
      // This is to protect against cases where the stream doesn't start with message_start.
      // We will just ignore these events.
      return
    }

    // Handle terminal events first
    if (json.type === 'message_stop') {
      controller.enqueue({ id: source.id, data: '[DONE]' })
      controller.terminate()
      return
    }
    if (source.event === 'error' || (json as any).type === 'error') {
      // Propagate error (maybe transform it)
      controller.enqueue(source)
      controller.terminate()
      return
    }

    const chunk: Partial<ChatCompletionChunk> = {
      id: this.id,
      model: this.model,
      created: Math.floor(Date.now() / 1000),
      object: 'chat.completion.chunk',
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: null
        }
      ]
    }

    if (json.type === 'message_start') {
      const { message } = json as Anthropic.Messages.MessageStartEvent
      chunk.choices![0].delta = { role: message.role }
      controller.enqueue({ id: source.id, data: JSON.stringify(chunk) })
      return
    }

    if (json.type === 'message_delta') {
      const { delta } = json as Anthropic.Messages.MessageDeltaEvent
      if (delta.stop_reason) {
        const finishReasonMapping: Record<string, OpenAI.Chat.Completions.ChatCompletion.Choice['finish_reason']> = {
          end_turn: 'stop',
          max_tokens: 'length',
          tool_use: 'tool_calls',
          stop_sequence: 'stop'
        }
        chunk.choices![0].finish_reason = finishReasonMapping[delta.stop_reason]
        if (delta.stop_reason === 'tool_use') {
          chunk.choices![0].delta = {
            tool_calls: Object.values(this.toolCallChunks)
          }
          this.toolCallChunks = {}
        }
        // The delta is empty in this case, which is correct for a finish_reason chunk
        controller.enqueue({ id: source.id, data: JSON.stringify(chunk) })
      }
      return
    }

    if (json.type === 'content_block_start') {
      const { content_block, index } = json as Anthropic.Messages.ContentBlockStartEvent
      if (content_block.type === 'tool_use') {
        this.toolCallChunks[index] = {
          index,
          id: content_block.id,
          type: 'function',
          function: {
            name: content_block.name,
            arguments: ''
          }
        }
      }
    }

    if (json.type === 'content_block_delta') {
      const { delta, index } = json as Anthropic.Messages.ContentBlockDeltaEvent
      if (delta.type === 'input_json_delta') {
        if (this.toolCallChunks[index]) {
          this.toolCallChunks[index].function.arguments += delta.partial_json
        }
      } else if (delta.type === 'text_delta') {
        chunk.choices![0].delta = { content: delta.text }
        controller.enqueue({ id: source.id, data: JSON.stringify(chunk) })
      }
    }
  }
}