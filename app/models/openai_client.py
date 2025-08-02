import httpx
from typing import List, Dict, Any

class OpenAIClient:
    def __init__(self, litellm_params: Dict[str, Any]):
        self.api_base = litellm_params.get("api_base")
        self.api_key = litellm_params.get("api_key")
        self._headers = {}
        if self.api_key:
            self._headers["Authorization"] = f"Bearer {self.api_key}"

    async def get_models(self) -> List[Dict[str, Any]]:
        """
        Fetches models from an OpenAI-compatible API.
        """
        if not self.api_base:
            print("`api_base` not found in litellm_params. Cannot fetch models.")
            return []

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{self.api_base}/models", headers=self._headers)
                response.raise_for_status()
                models_data = response.json()
                return models_data.get("data", [])
        except Exception as e:
            print(f"Failed to fetch models from '{self.api_base}': {e}")
            return []
