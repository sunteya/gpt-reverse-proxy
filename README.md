# gpt-reverse-proxy

A reverse proxy for ChatGPT API.

## Features

- Ensures compatibility with API calls from Cursor.
- Customize URL path prefixes.
- Secure the service with a custom authentication key.

## Usage

**The following configuration integrates Traefik, you need to modify it according to your own environment.**

1\. Fetch the project
```
git clone https://github.com/sunteya/gpt-reverse-proxy
```

2\. Edit `docker-compose.yml` file

```
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
      LOCAL_PATH_PREFIX: /chatgpt
      LOCAL_AUTH_TOKEN: any_token_you_wish
      # https_proxy: http://192.168.2.3:7890
      # LOG_LEVEL: debug
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.chatgpt.rule=HostRegexp(`{catch_all:.*}`) && PathPrefix(`/chatgpt`)"
      - "traefik.http.routers.chatgpt.tls.options=default"
      - "traefik.http.services.chatgpt.loadbalancer.server.port=3000"
```

3\. Run `docker compose up -d`

<hr>

```
Finally, your request is similar to the following.

curl -X POST -H "Authorization: any_token_you_wish" https://you.host/chatgpt/v1/chat/completions
will be converted to
curl -X POST -H "Authorization: Bearer sk-you-api-token" https://api.openai.com/v1/chat/completions
```
