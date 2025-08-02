import json
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from typing import Awaitable, Callable

from app.config import Settings
from .. import utils


class OllamaProxyMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, settings: Settings):
        super().__init__(app)
        self.settings = settings
        self.prefix = f"/{self.settings.local_ollama_secret}"
        self.prefixed_tags_path = f"{self.prefix}/api/tags"
        self.prefixed_show_path = f"{self.prefix}/api/show"

    async def handle_tags_request(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]):
        """Rewrites path to /v1/models, gets response from litellm, and reformats it for Ollama."""
        request.scope['path'] = '/v1/models'
        request.scope['raw_path'] = b'/v1/models'

        response = await call_next(request)
        response_body = await utils.read_response_body(response)

        try:
            data = json.loads(response_body.decode('utf-8'))
            models = [{"name": m.get("id"), "model": m.get("id")} for m in data.get("data", [])]
            return JSONResponse(content={'models': models}, status_code=response.status_code)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return Response(content=response_body, status_code=response.status_code, headers=response.headers)

    async def proxy_request(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]):
        """Strips the secret prefix from the path and forwards the request to litellm."""
        original_path = request.url.path
        stripped_path = original_path[len(self.prefix):]
        if not stripped_path:
            stripped_path = '/' # Prevent stripping to an empty path
        request.scope['path'] = stripped_path
        request.scope['raw_path'] = stripped_path.encode('utf-8')
        return await call_next(request)

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]):
        """This middleware routes requests based on the path prefix."""
        original_path = request.url.path

        # Add a flag to the request state if it's an ollama-proxied request,
        # so the authentication middleware can choose to bypass it.
        if original_path.startswith(self.prefix):
            request.state.is_ollama_proxy = True

        if original_path == self.prefixed_tags_path:
            return await self.handle_tags_request(request, call_next)
        elif original_path in [self.prefixed_show_path]:
            return await call_next(request)
        elif original_path.startswith(self.prefix):
            return await self.proxy_request(request, call_next)
        else:
            return await call_next(request)


def setup_ollama_routes(app, settings: Settings):
    @app.post(f"/{settings.local_ollama_secret}/api/show")
    async def handle_show():
        return JSONResponse(content={
            "model_info": { "general.architecture": "CausalLM" },
            "capabilities": ["chat", "tools", "stop", "reasoning"],
        })

    app.add_middleware(OllamaProxyMiddleware, settings=settings)
