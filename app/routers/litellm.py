import json
import sys
import litellm
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from typing import Callable, Awaitable
from starlette.responses import Response, StreamingResponse
from litellm import litellm
from litellm.proxy import proxy_server
from app.models.openai_client import OpenAIClient
from app.config import Settings
from app.auth import CustomAuth
from .. import utils
from ..openai2claudecode_llm import OpenAI2ClaudeCodeLLM


class EnrichModelsMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, router):
        super().__init__(app)
        self.router = router

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
                if model_id != "*":
                    if model_id not in seen_ids:
                        new_models.append(model)
                        seen_ids.add(model_id)
                    continue

                star_model_config = next((m for m in self.router.model_list if m.get('model_name') == model_id), None)
                if star_model_config and 'litellm_params' in star_model_config:
                    params = star_model_config['litellm_params']
                    client = OpenAIClient(litellm_params=params)
                    upstream_models = await client.get_models()
                    for upstream_model in upstream_models:
                        upstream_id = upstream_model.get("id")
                        if upstream_id and upstream_id not in seen_ids:
                            new_model_entry = model.copy()
                            new_model_entry["id"] = upstream_id
                            new_models.append(new_model_entry)
                            seen_ids.add(upstream_id)

            data["data"] = new_models
            return JSONResponse(content=data, status_code=response.status_code)

        except (json.JSONDecodeError, UnicodeDecodeError):
            return Response(content=response_body, status_code=response.status_code, media_type=response.media_type, headers=response.headers)

async def setup_litellm_routes(settings: Settings):
    config_path = settings.litellm_config_path
    try:

        proxy_server.user_custom_auth = CustomAuth(settings=settings)
        await proxy_server.initialize(config=config_path)

        proxy_server.app.add_middleware(EnrichModelsMiddleware, router=proxy_server.llm_router)
        print(f"LiteLLM Proxy server configured with '{config_path}' and middleware.")

    except Exception as e:
        import traceback
        print(f"Failed to load configuration: {e}")
        traceback.print_exc()
        sys.exit(1)
