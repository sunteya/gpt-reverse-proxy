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
from app.models.claudecode_streaming import ClaudeCodeStreamingResponseWrapper
from app.config import Settings
from app.auth import CustomAuth
from .. import utils
from .. import openai2claudecode_llm
from litellm.proxy.common_utils import http_parsing_utils

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

    async def hook_dispatch_models(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]):
        response = await call_next(request)
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

    async def hook_chat_completions(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]):
        body = await http_parsing_utils._read_request_body(request=request)
        messages = body.get('messages') or []

        new_messages = []
        for message in messages:
            converted_messages = utils.convert_to_openai_message(message)
            new_messages.extend(converted_messages)

        body['messages'] = new_messages

        new_body = json.dumps(body).encode('utf-8')
        request._body = new_body
        request.scope["headers"] = [
            (k, v) for k, v in request.scope["headers"]
            if k.lower() != b"content-length"
        ] + [(b"content-length", str(len(new_body)).encode())]

        return await call_next(request)

    async def hook_messages(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]):
        print(f"[hook_messages] Processing request to: {request.url.path}", flush=True)
        
        try:
            response = await call_next(request)
            
            content_type = response.headers.get('content-type', '')
            is_streaming = 'text/event-stream' in content_type
            
            if is_streaming:
                print("[hook_messages] Detected SSE response, wrapping iterator", flush=True)
                # Wrap the original iterator with our logging wrapper
                wrapped_iterator = ClaudeCodeStreamingResponseWrapper(response.body_iterator)
                
                return StreamingResponse(
                    wrapped_iterator,
                    status_code=response.status_code,
                    headers=dict(response.headers)
                )
            else:
                print("[hook_messages] Detected standard response, returning as-is", flush=True)
                return response
                
        except Exception as e:
            print(f"[hook_messages] Exception occurred: {e}", flush=True)
            import traceback
            traceback.print_exc()
            return JSONResponse(
                status_code=500,
                content={"error": "An internal error occurred."}
            )

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        if request.url.path in ["/v1/models", "/models"]:
            return await self.hook_dispatch_models(request, call_next)
        elif request.url.path in [ "/v1/chat/completions" ]:
            return await self.hook_chat_completions(request, call_next)
        # elif request.url.path in ["/v1/messages"]:
        #     return await self.hook_messages(request, call_next)
        else:
            return await call_next(request)


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
