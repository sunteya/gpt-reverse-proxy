import asyncio
import os
import uvicorn

# Initialize our own settings first, to avoid conflicts with litellm's .env loading.
from app.config import settings

# Now that our settings are loaded, we can import litellm.
from litellm.proxy import proxy_server
from app.routers.litellm import setup_litellm_routes
from app.routers.ollama import setup_ollama_routes

async def main():
    print("─" * 50)
    print("Application Settings:")
    for key, value in settings.model_dump().items():
        print(f"  {key}: {value}")
    print("─" * 50)

    # Setup middleware and routes
    await setup_litellm_routes(settings)
    app = proxy_server.app
    setup_ollama_routes(app, settings)

    # Run Uvicorn programmatically to allow for async setup before starting.
    server_config = uvicorn.Config(
        app, host="0.0.0.0", port=12000
    )
    server = uvicorn.Server(server_config)
    await server.serve()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Server stopped by user.")
