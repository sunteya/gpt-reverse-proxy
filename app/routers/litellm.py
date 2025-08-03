import json
import sys
import litellm
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from typing import Callable, Awaitable
from starlette.responses import Response, StreamingResponse
from litellm.router import Router
from litellm.proxy import proxy_server
from app.models.openai_client import OpenAIClient
from app.config import Settings
from app.auth import CustomAuth
from .. import utils
from .. import openai2claudecode_llm


class EnrichModelsMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, router: Router):
        super().__init__(app)
        self.router = router

    async def fetch_models(self, model_id: str):
        model_list = self.router.get_model_list() or []
        model_config = next((m for m in model_list if m.get('model_name') == model_id), None) or {}
        litellm_params = model_config.get('litellm_params') or {}
        model_name = litellm_params.get('model')

        if model_name and "/" in model_name:
            provider_name = model_name.split("/", 1)[0]
        else:
            provider_name = None

        if provider_name == "openai2claudecode":
            upstream_models = await openai2claudecode_llm.instance.get_models(litellm_params)
            return [upstream_model["id"] for upstream_model in upstream_models]
        else:
            client = OpenAIClient(litellm_params=litellm_params)
            upstream_models = await client.get_models()
            return [upstream_model["id"] for upstream_model in upstream_models]

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]):
        """This middleware enriches /models responses by expanding wildcard models."""
        response = await call_next(request)

        if request.url.path not in ["/v1/models", "/models"]:
            return response

        response_body = await utils.read_response_body(response)

        try:
            data = json.loads(response_body.decode('utf-8'))
            original_models = data.get("data", [])
            new_models = []
            seen_ids = set()

            for model in original_models:
                model_id = model.get("id")
                if "*" in model_id:
                    upstream_model_ids = await self.fetch_models(model_id)
                    for upstream_id in upstream_model_ids:
                        if upstream_id not in seen_ids:
                            new_model_entry = model.copy()
                            new_model_entry["id"] = upstream_id
                            new_models.append(new_model_entry)
                            seen_ids.add(upstream_id)

            data["data"] = new_models
            return JSONResponse(content=data, status_code=response.status_code)

        except (json.JSONDecodeError, UnicodeDecodeError):
            headers = dict(response.headers)
            headers.pop("content-length", None)
            return Response(content=response_body, status_code=response.status_code, media_type="application/json", headers=headers)

async def setup_litellm_routes(settings: Settings):
    config_path = settings.litellm_config_path
    try:
        proxy_server.user_custom_auth = CustomAuth(settings=settings)
        await proxy_server.initialize(config=config_path)

        assert proxy_server.llm_router is not None, "LiteLLM router should be initialized"
        proxy_server.app.add_middleware(EnrichModelsMiddleware, router=proxy_server.llm_router)
        print(f"LiteLLM Proxy server configured with '{config_path}' and middleware.")

    except Exception as e:
        import traceback
        print(f"Failed to load configuration: {e}")
        traceback.print_exc()
        sys.exit(1)
