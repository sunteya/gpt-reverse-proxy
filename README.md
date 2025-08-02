# gpt-reverse-proxy

A reverse proxy for ChatGPT API.

## Features

- Ensures compatibility with API calls from Cursor.
- Customize URL path prefixes.
- Secure the service with a custom authentication key.
- Ollama API compatibility for GitHub Copilot (emulates `/api/tags` and `/api/show` endpoints).

> [!NOTE]
> The `LOCAL_PATH_PREFIX` feature is currently not supported in the new Python version.

## Usage

**The following configuration integrates Traefik, you need to modify it according to your own environment.**

1\. Fetch the project
```
git clone https://github.com/sunteya/gpt-reverse-proxy app
```

2\. Create `litellm_config.yaml` file

Create a `litellm_config.yaml` file in your project root and configure your upstream provider. For more details, see the [LiteLLM documentation](https://docs.litellm.ai/docs/proxy/config).

```yaml
model_list:
  - model_name: "*"
    litellm_params:
      model: openai/*
      api_key: sk-you-api-keys
      api_base: https://your-host/v1
```

**For Claude Code integration**, you can add a specific mapping to route Claude models through the proxy:

```yaml
model_list:
  - model_name: "claude-sonnet-4-20250514"
    litellm_params:
      model: "openai2claudecode/claude-sonnet-4-20250514"
      api_base: https://your-host
      api_key: sk-you-keys

  - model_name: "*"
    litellm_params:
      model: openai/*
      api_key: sk-you-keys
      api_base: https://your-host/v1

litellm_settings:
  custom_provider_map:
    - provider: "openai2claudecode"
      custom_handler: "app.openai2claudecode_llm.instance"
```

3\. Edit `docker-compose.yml` file

```yaml
services:
  app:
    image: ghcr.io/astral-sh/uv:0.8.3-python3.13-bookworm
    volumes:
      - ./app:/app
      - ./litellm_config.yaml:/app/litellm_config.yaml
    working_dir: /app
    command: "uv run -m app.main"
    environment:
      LOCAL_AUTH_TOKEN: any_token_you_wish
      LOCAL_OLLAMA_SECRET: /your-secret-ollama-path

      # DUMP_HTTP_CONTENT: true
      # LOCAL_PATH_PREFIX: /prefix
      # https_proxy: http://192.168.2.3:7890
    # ports:
    #   - 12000:12000
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.chatgpt.rule=HostRegexp(`gpt-reverse-proxy.example.com`)
      - "traefik.http.routers.chatgpt.tls.options=default"
      - "traefik.http.services.chatgpt.loadbalancer.server.port=12000"
```

4\. Run `docker compose up -d`

<hr>

### Request Examples

#### Proxy for OpenAI API
This section demonstrates how to proxy requests to the OpenAI API. The proxy requires authentication via a bearer token (`LOCAL_AUTH_TOKEN`).

```bash
# Example with
# LOCAL_AUTH_TOKEN=any_token_you_wish

# Incoming request from the user
curl -X POST -H "Authorization: Bearer any_token_you_wish" https://you.host/v1/chat/completions

# The proxy forwards this as the following upstream request:
curl -X POST -H "Authorization: Bearer sk-you-api-token" https://api.openai.com/v1/chat/completions
```

#### Ollama Compatibility
This proxy can also emulate certain Ollama endpoints to provide compatibility with tools like GitHub Copilot. The access path for these endpoints is defined by `LOCAL_OLLAMA_SECRET`. These endpoints do not require authentication, but **for security, it is strongly recommended to change the default path (`/ollama`) to a secret value.**

```bash
# Example with
# LOCAL_OLLAMA_SECRET=your-secret-ollama-path

# Incoming request from the user
curl https://you.host/your-secret-ollama-path/api/tags

# The proxy intercepts this, converts it to a request to fetch models from the upstream, and formats the response to be Ollama-compatible:
curl -X GET -H "Authorization: Bearer sk-you-api-token" https://api.openai.com/v1/models
```
