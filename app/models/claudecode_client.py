import httpx
from typing import List, Dict, Any

from litellm.types.router import LiteLLMParamsTypedDict
from litellm._logging import verbose_proxy_logger


class ClaudeCodeClient:
    def __init__(self, litellm_params: LiteLLMParamsTypedDict | dict):
        self.api_base = litellm_params.get("api_base")
        self.api_key = litellm_params.get("api_key")
        self.litellm_params = litellm_params

    def build_extra_headers(self, headers: dict | None = None) -> dict:
        litellm_metadata = self.litellm_params.get('metadata') or {}
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

        auth_headers = {
            "Authorization": f"Bearer {self.api_key}",
            "x-api-key": self.api_key,
        }
        result.update(auth_headers)

        if headers:
            result.update(headers)

        return result

    async def get_models(self) -> List[Dict[str, Any]]:
        if not self.api_base:
            verbose_proxy_logger.warning("api_base not found in litellm_params for openai2claudecode. Cannot fetch models.")
            return []

        headers = self.build_extra_headers()

        try:
            async with httpx.AsyncClient() as client:
                print(f"Fetching models from openai2claudecode at {self.api_base}/v1/models")
                print(f"Using headers: {headers}")
                response = await client.get(f"{self.api_base}/v1/models", headers=headers)
                print(f"Response status code: {response.status_code}")
                print(f"Response: {response.text}")

                response.raise_for_status()
                models_data = response.json()
                return models_data.get("data", [])
        except Exception as e:
            verbose_proxy_logger.error(f"Failed to fetch models from openai2claudecode '{self.api_base}': {e}")
            return []