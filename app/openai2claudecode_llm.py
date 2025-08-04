from typing import Callable, AsyncIterator, List, Dict, Any
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
        verbose_proxy_logger.info(f"NON-STREAMING acompletion called for model={model}")
        litellm_params = litellm_params or {}
        model_info = litellm_params.get('model_info') or {}
        sponsor = model_info.get('sponsor', 'default')
        display_name = f"{model} ({sponsor})"
        verbose_proxy_logger.info(f"Proxying request for {display_name} to claude-code")

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
        display_name = f"{model} ({sponsor})"
        verbose_proxy_logger.info(f"Proxying stream request for {display_name} to claude-code")

        response = await litellm.acompletion(
            model=self.build_model(model),
            messages=self.build_messages(messages, optional_params),
            api_key=api_key,
            api_base=api_base,
            extra_headers=self.build_extra_headers(headers, litellm_params),
            timeout=self.build_timeout(timeout),
            **self.build_params(optional_params)
        )

        if isinstance(response, ModelResponse):
            for chunk in StreamingConverter.convert_model_response(response):
                # verbose_proxy_logger.info(f"Yielding chunk from async stream: {chunk}")
                yield chunk
        else:
            async for chunk in StreamingConverter.convert_stream_wrapper(response):
                # verbose_proxy_logger.info(f"Yielding chunk from async stream: {chunk}")
                yield chunk


    async def get_models(self, litellm_params: litellm.LiteLLMParamsTypedDict | dict) -> List[Dict[str, Any]]:
        litellm_params = litellm_params or {}
        api_base = litellm_params.get("api_base")
        api_key = litellm_params.get("api_key")

        if not api_base:
            verbose_proxy_logger.warning("api_base not found in litellm_params for openai2claudecode. Cannot fetch models.")
            return []

        headers = self.build_extra_headers({
            "Authorization": f"Bearer {api_key}",
            "x-api-key": api_key,
        }, litellm_params)

        try:
            async with httpx.AsyncClient() as client:
                print(f"Fetching models from openai2claudecode at {api_base}/v1/models")
                print(f"Using headers: {headers}")
                response = await client.get(f"{api_base}/v1/models", headers=headers)
                print(f"Response status code: {response.status_code}")
                print(f"Response: {response.text}")

                response.raise_for_status()
                models_data = response.json()
                return models_data.get("data", [])
        except Exception as e:
            verbose_proxy_logger.error(f"Failed to fetch models from openai2claudecode '{api_base}': {e}")
            return []

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