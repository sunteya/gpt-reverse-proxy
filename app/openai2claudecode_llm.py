from typing import Callable, AsyncIterator, List, Dict, Any, cast
import httpx

import litellm
from litellm import LiteLLMParamsTypedDict
from litellm.types.utils import GenericStreamingChunk, ModelResponse
from litellm.exceptions import APIConnectionError, ServiceUnavailableError, InternalServerError, Timeout, LITELLM_EXCEPTION_TYPES
from litellm.llms.custom_llm import CustomLLM
from litellm.litellm_core_utils.litellm_logging import Logging
from litellm._logging import verbose_logger, verbose_proxy_logger
from litellm.litellm_core_utils.streaming_handler import CustomStreamWrapper
from litellm.llms.custom_llm import CustomLLMError
from litellm.llms.anthropic.common_utils import AnthropicError
from .models.claudecode_client import ClaudeCodeClient
from .streaming_converter import StreamingConverter
from . import utils

class OpenAI2ClaudeCodeLLM(CustomLLM):
    def __init__(self):
        super().__init__()
        self.provider_name = "openai2claudecode"

    async def acompletion(self,
        model,
        messages,
        api_base: str,
        custom_prompt_dict: dict,
        model_response: ModelResponse,
        print_verbose: Callable,
        encoding,
        api_key,
        logging_obj: Logging,
        optional_params,
        acompletion = None,
        litellm_params: dict | None = None,
        logger_fn = None,
        headers = {},
        timeout = None,
        client = None,
    ):
        verbose_proxy_logger.info(f"NON-STREAMING acompletion called for model={model}")
        litellm_params = litellm_params or {}
        model_info = litellm_params.get('model_info') or {}
        sponsor = model_info.get('sponsor', 'default')
        display_name = f"{model} ({sponsor})"
        verbose_proxy_logger.info(f"Proxying request for {display_name} to claude-code")

        try:
            response = await litellm.acompletion(
                model=self.build_model(model),
                messages=self.build_messages(messages, optional_params),
                api_key=api_key,
                api_base=api_base,
                extra_headers=self.build_extra_headers(headers, litellm_params),
                timeout=self.build_timeout(timeout),
                **self.build_params(optional_params)
            )
            return response
        except litellm.exceptions.APIConnectionError as e:
            verbose_proxy_logger.error(f"Error during acompletion for {display_name}: {type(e)} - {str(e)}")
            if error := utils.find_exception_in_chain(e, httpx.HTTPStatusError):
                response = error.response
                raise ServiceUnavailableError(
                    f"upstream error {response.status_code} for {response.url}",
                    llm_provider=self.provider_name,
                    model=model,
                )

            raise

    async def astreaming(self, # type: ignore[reportIncompatibleMethodOverride]
        model,
        messages,
        api_base,
        custom_prompt_dict,
        model_response,
        print_verbose,
        encoding,
        api_key,
        logging_obj: Logging,
        optional_params,
        acompletion = None,
        litellm_params: dict | None = None,
        logger_fn = None,
        headers = {},
        timeout = None,
        client = None,
    ) -> AsyncIterator[GenericStreamingChunk]:
        import time
        start_time = time.time()
        litellm_params = litellm_params or {}
        model_info = litellm_params.get('model_info') or {}
        sponsor = model_info.get('sponsor', 'anonymous')
        display_name = f"{model} ({sponsor})"
        
        verbose_proxy_logger.info(f"[{start_time:.3f}] STEP 1: Starting astreaming for {display_name}")
        print(f"[{start_time:.3f}] STEP 1: Starting astreaming for {display_name}")

        try:
            verbose_proxy_logger.info(f"[{time.time():.3f}] STEP 2: About to call litellm.acompletion for {display_name}")
            print(f"[{time.time():.3f}] STEP 2: About to call litellm.acompletion for {display_name}")
            
            response = await litellm.acompletion(
                model=self.build_model(model),
                messages=self.build_messages(messages, optional_params),
                api_key=api_key,
                api_base=api_base,
                extra_headers=self.build_extra_headers(headers, litellm_params),
                timeout=self.build_timeout(timeout),
                **self.build_params(optional_params)
            )

            verbose_proxy_logger.info(f"[{time.time():.3f}] STEP 3: Successfully got response from litellm.acompletion for {display_name}: {type(response)}")
            print(f"[{time.time():.3f}] STEP 3: Successfully got response from litellm.acompletion for {display_name}: {type(response)}")

            if isinstance(response, ModelResponse):
                verbose_proxy_logger.info(f"[{time.time():.3f}] STEP 4a: Processing ModelResponse for {display_name}")
                print(f"[{time.time():.3f}] STEP 4a: Processing ModelResponse for {display_name}")
                chunk_count = 0
                for chunk in StreamingConverter.convert_model_response(response):
                    chunk_count += 1
                    verbose_proxy_logger.info(f"[{time.time():.3f}] STEP 4a-{chunk_count}: Yielding chunk from ModelResponse for {display_name}")
                    yield chunk
                verbose_proxy_logger.info(f"[{time.time():.3f}] STEP 4a-END: Finished yielding {chunk_count} chunks from ModelResponse for {display_name}")
                print(f"[{time.time():.3f}] STEP 4a-END: Finished yielding {chunk_count} chunks from ModelResponse for {display_name}")
            else:
                verbose_proxy_logger.info(f"[{time.time():.3f}] STEP 4b: Processing streaming response for {display_name}")
                print(f"[{time.time():.3f}] STEP 4b: Processing streaming response for {display_name}")

                response_iter = aiter(response)
                chunk_count = 0
                try:
                    verbose_proxy_logger.info(f"[{time.time():.3f}] STEP 4a: Got first chunk successfully for {display_name}")
                    
                    async for chunk in StreamingConverter.convert_stream_wrapper(response):
                        chunk_count += 1
                        verbose_proxy_logger.info(f"[{time.time():.3f}] STEP 4b-{chunk_count}: Yielding chunk from stream for {display_name}")
                        yield chunk
                    verbose_proxy_logger.info(f"[{time.time():.3f}] STEP 4b-END: Finished yielding {chunk_count} chunks from stream for {display_name}")
                    print(f"[{time.time():.3f}] STEP 4b-END: Finished yielding {chunk_count} chunks from stream for {display_name}")
                except Exception as stream_e:
                    verbose_proxy_logger.error(f"[{time.time():.3f}] STEP 4b-ERROR: Exception in StreamingConverter for {display_name}: {type(stream_e).__name__}: {stream_e}")
                    print(f"[{time.time():.3f}] STEP 4b-ERROR: Exception in StreamingConverter for {display_name}: {type(stream_e).__name__}: {stream_e}")
                    raise stream_e
                    
        except Exception as e:
            error_time = time.time()
            verbose_proxy_logger.error(f"[{error_time:.3f}] EXCEPTION in astreaming for {display_name} (after {error_time - start_time:.3f}s): {type(e).__name__}: {e}")
            verbose_proxy_logger.error(f"Full exception details: {e.__class__.__module__}.{e.__class__.__qualname__}: {str(e)}")
            
            raise APIConnectionError(
                message=f"Error during astreaming for {display_name}: {type(e).__name__} - {str(e)}",
                llm_provider=self.provider_name,
                model=model,
            )


    async def get_models(self, litellm_params: litellm.LiteLLMParamsTypedDict | dict) -> List[Dict[str, Any]]:
        client = ClaudeCodeClient(litellm_params)
        return await client.get_models()

    def build_timeout(self, timeout: float | httpx.Timeout | None):
        if isinstance(timeout, httpx.Timeout):
            values = [v for v in timeout.as_dict().values() if v is not None]
            if not values:
                return None
            return sum(values)

        return timeout

    def build_extra_headers(self, headers: dict | None, litellm_params: LiteLLMParamsTypedDict | dict | None) -> dict:
        litellm_params = litellm_params or {}
        litellm_metadata = litellm_params.get('metadata') or {}
        request_headers = litellm_metadata.get('headers') or {}

        default_headers = {
            "anthropic-beta": "claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14",
            "anthropic-dangerous-direct-browser-access": "true",
            "user-agent": "claude-cli/1.0.64 (external, cli)"
        }

        result = default_headers.copy()
        for key in ['anthropic-beta', 'anthropic-dangerous-direct-browser-access']:
            if key in request_headers and request_headers[key] is not None:
                result[key] = request_headers[key]

        if headers:
            result.update(headers)

        return result

    def build_messages(self, messages: list, optional_params: dict):
        result = []
        result.append({
            "role": "system",
            "content": "You are Claude Code, Anthropic's official CLI for Claude."
        })

        for msg in optional_params.get("system") or []:
            result.append({
                "role": "system",
                "content": msg['text']
            })

        result.extend(messages)
        return result

    def build_model(self, model: str):
        return model.replace(f"{self.provider_name}/", "anthropic/")

    def build_params(self, optional_params: dict):
        keys = [
            "temperature", "top_p", "n",
            "tools", "stream", "max_tokens"
        ]
        return { key: optional_params[key] for key in keys if key in optional_params }

instance = OpenAI2ClaudeCodeLLM()