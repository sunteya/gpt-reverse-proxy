# gpt-reverse-proxy

A reverse proxy for ChatGPT API.

## Features

- Ensures compatibility with API calls from Cursor.
- Customize URL path prefixes.
- Secure the service with a custom authentication key.
- Ollama API compatibility for GitHub Copilot (emulates `/api/tags` and `/api/show` endpoints).

## Usage

**The following configuration integrates Traefik, you need to modify it according to your own environment.**

1\. Fetch the project
```
git clone https://github.com/sunteya/gpt-reverse-proxy app
```

2\. Edit `docker-compose.yml` file

```yaml
version: "3"
services:
  app:
    image: guergeiro/pnpm:20-10
    volumes:
      - ./app:/app
      - ./root:/root/
    working_dir: /app
    command: "pnpm tsx server.ts"
    environment:
      UPSTREAM_URL: https://api.openai.com
      UPSTREAM_AUTHORIZATION: Bearer sk-you-api-token
      # https_proxy: http://192.168.2.3:7890

      LOCAL_AUTH_TOKEN: any_token_you_wish
      LOCAL_OLLAMA_SECRET: /your-secret-ollama-path
      # LOCAL_PATH_PREFIX: /your-path-prefix
      # LOG_LEVEL: debug
    # ports:
    #   - 12000:12000
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.chatgpt.rule=HostRegexp(`{catch_all:.*}`) && PathPrefix(`/chatgpt`)"
      - "traefik.http.routers.chatgpt.tls.options=default"
      - "traefik.http.services.chatgpt.loadbalancer.server.port=12000"
```

3\. Run `docker compose up -d`

<hr>

### Request Examples

#### Proxy for OpenAI API
This section demonstrates how to proxy requests to the OpenAI API. The proxy supports adding a custom path prefix (`LOCAL_PATH_PREFIX`) and requires authentication via a bearer token (`LOCAL_AUTH_TOKEN`).

```bash
# Example with
# LOCAL_PATH_PREFIX=/your-path-prefix
# LOCAL_AUTH_TOKEN=any_token_you_wish

# Incoming request from the user
curl -X POST -H "Authorization: Bearer any_token_you_wish" https://you.host/your-path-prefix/v1/chat/completions

# The proxy forwards this as the following upstream request:
curl -X POST -H "Authorization: Bearer sk-you-api-token" https://api.openai.com/v1/chat/completions
```

#### Ollama Compatibility
This proxy can also emulate certain Ollama endpoints to provide compatibility with tools like GitHub Copilot. The access path for these endpoints is defined by `LOCAL_OLLAMA_SECRET`. These endpoints do not require authentication, but **for security, it is strongly recommended to change the default path (`/ollama`) to a secret value.**

```bash
# Example with
# LOCAL_PATH_PREFIX=/your-path-prefix
# LOCAL_OLLAMA_SECRET=/your-secret-ollama-path

# Incoming request from the user
curl https://you.host/your-path-prefix/your-secret-ollama-path/api/tags

# The proxy intercepts this, converts it to a request to fetch models from the upstream, and formats the response to be Ollama-compatible:
curl -X GET -H "Authorization: Bearer sk-you-api-token" https://api.openai.com/v1/models
```
