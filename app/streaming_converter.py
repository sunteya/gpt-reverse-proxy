from typing import AsyncIterator, Iterator

from litellm.litellm_core_utils.streaming_handler import CustomStreamWrapper
from litellm.types.utils import GenericStreamingChunk, ModelResponseStream, ModelResponse
from litellm.types.llms.openai import ChatCompletionToolCallChunk


class StreamingConverter:
    @staticmethod
    async def convert_async_stream(response: CustomStreamWrapper) -> AsyncIterator[GenericStreamingChunk]:
        async for chunk in response:
            for converted_chunk in StreamingConverter._convert_chunk(chunk):
                yield converted_chunk

    @staticmethod
    def convert_model_response_to_stream(response: ModelResponse) -> Iterator[GenericStreamingChunk]:
        choices = getattr(response, 'choices', [])
        if choices:
            choice = choices[0]
            message = getattr(choice, 'message', {})
            content = getattr(message, 'content', '') or ''
            finish_reason = getattr(choice, 'finish_reason', 'stop')

            yield GenericStreamingChunk(
                finish_reason=finish_reason,
                index=0,
                is_finished=True,
                text=content,
                tool_use=None,
                usage=getattr(response, 'usage', None),
            )

    @staticmethod
    def _convert_chunk(chunk: ModelResponseStream) -> Iterator[GenericStreamingChunk]:
        choices = getattr(chunk, 'choices', [])
        if choices:
            choice = choices[0]
            delta = getattr(choice, 'delta', {})
            content = getattr(delta, 'content', '') or ''
            finish_reason = getattr(choice, 'finish_reason', None)

            tool_calls = getattr(delta, 'tool_calls', None)

            if content and not tool_calls:
                yield GenericStreamingChunk(
                    finish_reason=finish_reason or "",
                    index=0,
                    is_finished=finish_reason is not None,
                    text=content,
                    tool_use=None,
                    usage=None,
                )

            if tool_calls:
                for tool_call in tool_calls:
                    function = getattr(tool_call, 'function', {})
                    tool_call_id = getattr(tool_call, 'id', None)
                    function_name = getattr(function, 'name', None)
                    arguments = getattr(function, 'arguments', '')

                    # 构建工具调用 chunk
                    tool_use_chunk = ChatCompletionToolCallChunk(
                        id=tool_call_id,
                        type='function',
                        function={
                            'name': function_name,
                            'arguments': arguments
                        },
                        index=getattr(tool_call, 'index', 0)
                    )

                    yield GenericStreamingChunk(
                        finish_reason=finish_reason or "",
                        index=getattr(tool_call, 'index', 0),
                        is_finished=finish_reason is not None,
                        text="",
                        tool_use=tool_use_chunk,
                        usage=None,
                    )

            if not content and not tool_calls and finish_reason:
                yield GenericStreamingChunk(
                    finish_reason=finish_reason,
                    index=0,
                    is_finished=True,
                    text="",
                    tool_use=None,
                    usage=None,
                )
        else:
            yield GenericStreamingChunk(
                finish_reason="",
                index=0,
                is_finished=False,
                text="",
                tool_use=None,
                usage=None,
            )