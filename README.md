### gpt-reverse-proxy

TypeScript-based, pluggable reverse proxy for LLM APIs. Supports OpenAI-compatible, Claude and Ollama-compatible paths. Includes model-aware upstream routing, streaming-safe transforms, request/response dumping and a lightweight debug UI.

### Highlights

- Pluggable endpoints for OpenAI, Claude and Ollama-compatible flows
- Model-aware routing with extensible hooks for requests/responses
- Streaming-safe transforms and built-in debug UI/logging

### Quick start

1. Clone
```bash
git clone https://github.com/sunteya/gpt-reverse-proxy
cd gpt-reverse-proxy
```

2. Create `config.yml` (example)
```yaml
endpoints:
  - prefix: /cursor # recommend add a random string for secret
    type: openai
    plugins:
      - patches/cursor-compatible # fixes cursor compatibility issues

  # - prefix: /any/path
  #   type: ollama # openai, ollama, claude

upstreams:
  - name: anything
    protocols: # matches endpoint type
      - openai
      # - ollama
    api_base: https://<your-openai-like-host>
    # api_key: <your-api-key> # overrides request authorization if set

  - name: openai-to-claude
    protocols:
      - openai
      - claude
    models:
      - claude-* # only this model
    plugins:
      - transformers/openai-to-claude # convert OpenAI to Claude
      # - patches/simulate-claude-code-client # simulate Claude Code client
    api_base: https://<your-claude-host>
    api_key: <your-claude-key>

  # - name: ollama-to-openai-to-claude
  #   protocols:
  #     - ollama
  #     - openai
  #   plugins:
  #     - transformers/ollama-to-openai
  #     - transformers/openai-to-claude
  #   api_base: https://<your-openai-like-host>
  #   api_key: <your-api-key>
```

3. Run locally
```bash
pnpm install
pnpm tsx server.ts
```

4. Docker Compose (Traefik labels optional)
```yaml
services:
  app:
    image: guergeiro/pnpm:22-10
    volumes:
      - ./app:/app
      - ./root:/root
      - ./config.yml:/app/config.yml
    working_dir: /app
    command: "bash -c 'pnpm install && pnpm tsx server.ts'"
    ports:
      - 12000:12000
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.grp.rule=HostRegexp(`grp.example.com`)"
      - "traefik.http.routers.grp.tls.options=default"
      - "traefik.http.services.grp.loadbalancer.server.port=12000"
```

### Configuration

- `endpoints[]` (inbound endpoints):
  - `prefix`: base path, e.g. `/cursor`
  - `type`: `openai` | `claude` | `ollama` | `debug`
  - `plugins?`: hook names to run for this endpoint
  - Tip: you can set `prefix` to a random, non-guessable string for lightweight access control, e.g. `/ollama-ig5iecaetiechiequee6`

- `upstreams[]` (target services):
  - `name`: label for logs only
  - `protocols?`: which endpoint types this upstream accepts; if omitted, no restriction
  - `models?`: optional model glob patterns, e.g. "claude-*"
  - `api_base`: upstream base URL
  - `api_key`: bearer token injected when proxying upstream
  - `https_proxy?`: proxy URL for upstream fetch (per-upstream)
  - `plugins?`: hook names to transform request/response for this upstream

Upstream selection: match by endpoint `type` (i.e., `protocol`), then filter by `models` if provided; the first match is used.

### Built-in plugins

- `patches/cursor-compatible`: improve SSE compatibility with Cursor clients
- `patches/simulate-claude-code-client`: emulate Claude CLI client behavior for better compatibility
- `patches/json-patch-request`: applies conditional JSON patches to the request body. This is useful for modifying request payloads on the fly, for example, to alias model names.

  Example configuration in `config.yml`:
  ```yaml
  endpoints:
    - prefix: /cursor
      type: openai
      plugins:
        patches/json-patch-request:
          alias-gpt5: # A named ruleset
            - {op: "test", path: "/model", value: "openai-g5"}
            - {op: "replace", path: "/model", value: "gpt-5"}
  ```

- `transformers/openai-to-claude`: translate between OpenAI Chat Completions and Claude Messages (incl. streaming)
- `transformers/ollama-to-openai`: provide Ollama tags/show compatibility backed by an OpenAI-compatible Models API

Plugins are discovered from `patches/` and `transformers/` by filename at startup. Export a `Hook` instance.

### Debugging

1) Build the debug UI (one-time)
```bash
cd debug-ui
pnpm install
pnpm build
cd ..
```

2) Configure a `debug` endpoint in `config.yml` (choose any prefix you like):
```yaml
endpoints:
  - prefix: /debug
    type: debug
```

3) Usage
- `<prefix>/` serves the built UI from `debug-ui/dist`
- `<prefix>/log/*` serves files from the project `log/` directory

4) Logs
- The server writes logs to `log/...` in JSONL.
- A new file is created per request at a path derived from the URL. For example, hitting `/cursor/v1/chat/completions` creates something like `log/cursor/v1/chat/completions/<timestamp>.jsonl`.
- Each line is a JSON object with fields like `timestamp`, `leg` (user|upstream), `direction` (request|response), `event` (info|body|chunk), and `payload`.


### Security

- Incoming requests are unauthenticated by default; deploy behind a reverse proxy and scope exposure
- Do not commit real hosts or keys; use placeholders and a secrets manager
- Prefer secret, non-guessable prefixes and combine with Traefik/firewall rules

### Development

```bash
pnpm install
pnpm tsx server.ts
```

- Create custom hooks under `patches/` or `transformers/` and export a subclass of `Hook`
- Types: see `endpoints/types.ts`
- Static assets are served from `public/`; the debug UI is served via your configured `debug` endpoint

### License

MIT
