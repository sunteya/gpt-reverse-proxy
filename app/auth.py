from fastapi import Request
from litellm.proxy._types import UserAPIKeyAuth, ProxyException
from app.config import Settings


class CustomAuth:
    def __init__(self, settings: Settings):
        """
        Initializes the custom authentication handler with app settings.
        """
        self.settings = settings

    async def __call__(self, request: Request, api_key: str) -> UserAPIKeyAuth:
        """
        Custom authentication callable class for the litellm proxy.
        If local_auth_token is set, it checks the provided API key.
        If not set, it allows all requests to pass through.
        It also bypasses authentication for requests proxied from Ollama.
        """
        if getattr(request.state, "is_ollama_proxy", False):
            return UserAPIKeyAuth(api_key=api_key)

        if not self.settings.local_auth_token:
            return UserAPIKeyAuth(api_key=api_key)

        if api_key.startswith("Bearer "):
            key_to_check = api_key[7:]
        else:
            key_to_check = api_key

        if key_to_check == self.settings.local_auth_token:
            return UserAPIKeyAuth(api_key=key_to_check, user_role="proxy_admin")
        else:
            raise ProxyException(
                message="Invalid API Key",
                type="authentication_error",
                code=401,
            )
