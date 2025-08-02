from typing import Callable, AsyncIterator
import httpx

import litellm
from litellm.types.utils import GenericStreamingChunk, ModelResponse
from litellm.exceptions import APIConnectionError, ServiceUnavailableError
from litellm.llms.custom_llm import CustomLLM
from litellm.litellm_core_utils.litellm_logging import Logging
from litellm._logging import verbose_logger, verbose_proxy_logger

from .streaming_converter import StreamingConverter

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
        litellm_params = litellm_params or {}
        model_info = litellm_params.get('model_info') or {}
        sponsor = model_info.get('sponsor', 'default')
        verbose_proxy_logger.info(f"Proxying request for {model} ({sponsor}) to claude-code")

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
        except APIConnectionError as e:
            verbose_proxy_logger.error(f"APIConnectionError for {model}: {e}")
            raise ServiceUnavailableError(
                f"Service temporarily unavailable: {str(e)}",
                llm_provider=self.provider_name,
                model=model
            )

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
        litellm_params = litellm_params or {}
        model_info = litellm_params.get('model_info') or {}
        sponsor = model_info.get('sponsor', 'anonymous')
        verbose_proxy_logger.info(f"Proxying stream request for {model} ({sponsor}) to claude-code")

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
        except APIConnectionError as e:
            verbose_proxy_logger.error(f"APIConnectionError for {model}: {e}")
            raise ServiceUnavailableError(
                f"Service temporarily unavailable: {str(e)}",
                llm_provider=self.provider_name,
                model=model
            )

        if isinstance(response, ModelResponse):
            for chunk in StreamingConverter.convert_model_response_to_stream(response):
                yield chunk
        else:
            async for chunk in StreamingConverter.convert_async_stream(response):
                yield chunk


    def build_timeout(self, timeout: float | httpx.Timeout | None):
        if isinstance(timeout, httpx.Timeout):
            values = [v for v in timeout.as_dict().values() if v is not None]
            if not values:
                return None
            return sum(values)

        return timeout

    def build_extra_headers(self, headers: dict | None, litellm_params: dict | None) -> dict:
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