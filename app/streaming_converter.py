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
        
        try:
            async for stream in response:
                if stream is None:
                    continue

                print(f"[Received message] CustomStreamWrapper stream: {stream.json()}", flush=True)

                error = stream.get('error', None)  # Ensure we don't miss any error in the stream
                if error:
                    print(f"Error in stream: {error} =====================================", flush=True)

                for choice in stream.choices:
                    if choice.finish_reason == 'error':
                        print(f"Error in choice: {choice} =====================================", flush=True)

                # verbose_proxy_logger.info(f"Converting chunk: {stream}")
                for converted_chunk in StreamingConverter._convert_chunk(stream):
                    converted_chunk['index'] = index_counter
                    index_counter += 1
                    print(f"[Converted message] Converted from stream: {converted_chunk}", flush=True)
                    yield converted_chunk
        except Exception as e:
            print(f"Exception in convert_stream_wrapper: {e} ====================================", flush=True)
            # import traceback
            # traceback.print_exc()
            raise

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
        print(f"[Received message] ModelResponse: {response}")

        index_counter = 0
        for choice in response.choices:
            if isinstance(choice, StreamingChoices):
                for chunk in StreamingConverter._convert_streaming_choices(choice):
                    chunk['index'] = index_counter
                    index_counter += 1

                    if StreamingConverter.is_stuck_chunk(chunk):
                        error_chunk = GenericStreamingChunk(
                            finish_reason='error',
                            is_finished=True,
                            index=chunk['index'],
                            text='An unexpected error occurred: Empty response from model',
                            tool_use=None,
                            usage=None
                        )
                        print(f"[Converted message] Error handling: {error_chunk}")
                        yield error_chunk
                    else:
                        print(f"[Converted message] Converted from StreamingChoices: {chunk}")
                        yield chunk
            else:
                message = choice.message

                content = message.content
                if content:
                    content_chunk = GenericStreamingChunk(
                        finish_reason = '',
                        is_finished = False,
                        index = index_counter,
                        text = content,
                        tool_use = None,
                        usage = None,
                    )
                    print(f"[Converted message] Content chunk: {content_chunk}")
                    yield content_chunk
                    index_counter += 1

                tool_calls = message.tool_calls or []
                for chunk in StreamingConverter._convert_tool_calls(tool_calls):
                    chunk['index'] = index_counter
                    print(f"[Converted message] Tool call: {chunk}")
                    yield chunk
                    index_counter += 1

                finish_reason = choice.finish_reason
                final_chunk = GenericStreamingChunk(
                    finish_reason = finish_reason,
                    is_finished = True,
                    index = index_counter,
                    text = content or '',
                    tool_use = None,
                    usage = getattr(response, 'usage', None)
                )
                print(f"[Converted message] Final chunk: {final_chunk}")
                yield final_chunk
                index_counter += 1

    @staticmethod
    def _convert_chunk(stream: ModelResponseStream) -> Iterator[GenericStreamingChunk]:
        for choice in stream.choices:
            for chunk in StreamingConverter._convert_streaming_choices(choice):
                yield chunk

    @staticmethod
    def _convert_streaming_choices(choice: StreamingChoices) -> Iterator[GenericStreamingChunk]:
        delta = choice.delta
        print(f"[Received message] StreamingChoices delta: {delta}")

        content = delta.content
        if content:
            content_chunk = GenericStreamingChunk(
                finish_reason = '',
                is_finished = False,
                index = 0,
                text = content,
                tool_use = None,
                usage = None,
            )
            print(f"[Converted message] Content delta: {content_chunk}")
            yield content_chunk

        tool_calls = delta.tool_calls or []
        for chunk in StreamingConverter._convert_tool_calls(tool_calls):
            yield chunk

        finish_reason = choice.finish_reason or ''
        is_finished = finish_reason != ''
        if is_finished:
            finish_chunk = GenericStreamingChunk(
                finish_reason=finish_reason,
                is_finished=is_finished,
                index = 0,
                text = "",
                tool_use = None,
                usage = None,
            )
            print(f"[Converted message] Final delta: {finish_chunk}")
            yield finish_chunk

    @staticmethod
    def _convert_tool_calls(tool_calls: list[ChatCompletionDeltaToolCall] | list[ChatCompletionMessageToolCall]) -> Iterator[GenericStreamingChunk]:
        print(f"[Received message] Number of tool calls: {len(tool_calls)}")
        for i, tool_call in enumerate(tool_calls):
            function = tool_call.function
            print(f"[Received message] Tool call {i}: id={tool_call.id}, function.name={function.name}, function.arguments={function.arguments}")

            # If there is an id and name, output the initial chunk
            if tool_call.id and function.name:
                tool_chunk = GenericStreamingChunk(
                    finish_reason = '',
                    is_finished = False,
                    index = 0,
                    text = "",
                    tool_use = ChatCompletionToolCallChunk(
                        id = tool_call.id,
                        type = 'function',
                        function = {
                            'name': function.name,
                            'arguments': ''
                        },
                        index=0
                    ),
                    usage=None,
                )
                print(f"[Converted message] Tool call initial chunk: {tool_chunk}")
                yield tool_chunk
            
            # If there is an argument fragment, output the argument chunk
            if function.arguments:
                args_chunk = GenericStreamingChunk(
                    finish_reason = '',
                    is_finished = False,
                    index = 0,
                    text = "",
                    tool_use = ChatCompletionToolCallChunk(
                        id = tool_call.id,
                        type = 'function',
                        function = {
                            'name': None,
                            'arguments': function.arguments
                        },
                        index=0
                    ),
                    usage=None,
                )
                print(f"[Converted message] Tool call argument chunk: {args_chunk}")
                yield args_chunk
