from typing import AsyncIterator, Iterator

from litellm import ChatCompletionMessageToolCall
from litellm.litellm_core_utils.streaming_handler import CustomStreamWrapper
from litellm.types.utils import GenericStreamingChunk, ModelResponseStream, ModelResponse
from litellm.types.llms.openai import ChatCompletionToolCallChunk
from litellm.types.utils import StreamingChoices
from litellm.types.utils import ChatCompletionDeltaToolCall

from litellm._logging import verbose_proxy_logger


class StreamingConverter:
    @staticmethod
    async def convert_stream_wrapper(response: CustomStreamWrapper) -> AsyncIterator[GenericStreamingChunk]:
        index_counter = 0
        async for stream in response:
            if stream is None:
                continue

            # verbose_proxy_logger.info(f"Converting chunk: {stream}")
            for converted_chunk in StreamingConverter._convert_chunk(stream):
                converted_chunk['index'] = index_counter
                index_counter += 1
                yield converted_chunk

    @staticmethod
    def is_stuck_chunk(chuck: GenericStreamingChunk):
        index = chuck.get("index")
        if index is not None and index > 0:
            return False

        is_finished = chuck.get('is_finished')
        if not is_finished:
            return False

        content = chuck.get('text')
        if content:
            return False

        finish_reason = chuck.get('finish_reason')
        if finish_reason == 'stop':
            return True

        return False

    @staticmethod
    def convert_model_response(response: ModelResponse) -> Iterator[GenericStreamingChunk]:
        # verbose_proxy_logger.info(f"Converting model response: {response}")

        index_counter = 0
        for choice in response.choices:
            if isinstance(choice, StreamingChoices):
                for chunk in StreamingConverter._convert_streaming_choices(choice):
                    chunk['index'] = index_counter
                    index_counter += 1

                    if StreamingConverter.is_stuck_chunk(chunk):
                        yield GenericStreamingChunk(
                            finish_reason='error',
                            is_finished=True,
                            index=chunk['index'],
                            text='An unexpected error occurred: Empty response from model',
                            tool_use=None,
                            usage=None
                        )
                    else:
                        yield chunk
            else:
                message = choice.message

                content = message.content
                if content:
                    yield GenericStreamingChunk(
                        finish_reason = '',
                        is_finished = False,
                        index = index_counter,
                        text = content,
                        tool_use = None,
                        usage = None,
                    )
                    index_counter += 1

                tool_calls = message.tool_calls or []
                for chunk in StreamingConverter._convert_tool_calls(tool_calls):
                    chunk['index'] = index_counter
                    yield chunk
                    index_counter += 1

                finish_reason = choice.finish_reason
                yield GenericStreamingChunk(
                    finish_reason = finish_reason,
                    is_finished = True,
                    index = index_counter,
                    text = content or '',
                    tool_use = None,
                    usage = getattr(response, 'usage', None)
                )
                index_counter += 1

    @staticmethod
    def _convert_chunk(stream: ModelResponseStream) -> Iterator[GenericStreamingChunk]:
        for choice in stream.choices:
            for chunk in StreamingConverter._convert_streaming_choices(choice):
                yield chunk

    @staticmethod
    def _convert_streaming_choices(choice: StreamingChoices) -> Iterator[GenericStreamingChunk]:
        delta = choice.delta

        content = delta.content
        if content:
            yield GenericStreamingChunk(
                finish_reason = '',
                is_finished = False,
                index = 0,
                text = content,
                tool_use = None,
                usage = None,
            )

        tool_calls = delta.tool_calls or []
        for chunk in StreamingConverter._convert_tool_calls(tool_calls):
            yield chunk

        finish_reason = choice.finish_reason or ''
        is_finished = finish_reason != ''
        if is_finished:
            yield GenericStreamingChunk(
                finish_reason=finish_reason,
                is_finished=is_finished,
                index = 0,
                text = "",
                tool_use = None,
                usage = None,
            )

    @staticmethod
    def _convert_tool_calls(tool_calls: list[ChatCompletionDeltaToolCall] | list[ChatCompletionMessageToolCall]) -> Iterator[GenericStreamingChunk]:
        for tool_call in tool_calls:
            function = tool_call.function

            yield GenericStreamingChunk(
                finish_reason = '',
                is_finished = False,
                index = 0,
                text = "",
                tool_use = ChatCompletionToolCallChunk(
                    id = tool_call.id,
                    type = 'function',
                    function = {
                        'name': function.name,
                        'arguments': function.arguments
                    },
                    index=0
                ),
                usage=None,
            )