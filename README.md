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
  - prefix: /cursor
    type: openai
    plugins:
      - patches/cursor-compatible

  - prefix: /vscode
    type: ollama

  - prefix: /claude
    type: claude

upstreams:
  # OpenAI-compatible upstream(s)
  - name: openai-any
    protocols: [openai]
    api_base: https://<your-openai-like-host>
    api_key: <your-api-key>

  # Use OpenAI client against a Claude backend (auto convert request/response)
  - name: claude-via-openai
    protocols: [openai]
    models: ["claude-*"]
    plugins:
      - transformers/openai-to-claude
    api_base: https://<your-claude-host>
    api_key: <your-claude-key>

  # Native Claude client usage
  - name: claude-native
    protocols: [claude]
    plugins:
      - patches/simulate-claude-code-client
    models: ["claude-*"]
    api_base: https://<your-claude-host>
    api_key: <your-claude-key>

  # Make Ollama tags/show talk to an OpenAI-compatible backend
  - name: ollama-compat
    protocols: [ollama]
    plugins:
      - transformers/ollama-to-openai
    api_base: https://<your-openai-like-host>
    api_key: <your-api-key>
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
  - `type`: `openai` | `claude` | `ollama`
  - `plugins?`: hook names to run for this endpoint
  - Tip: you can set `prefix` to a random, non-guessable string for lightweight access control, e.g. `/ollama-ig5iecaetiechiequee6`

- `upstreams[]` (target services):
  - `name`: label for logs only
  - `protocols?`: which endpoint types this upstream accepts; if omitted, no restriction
  - `models?`: optional model glob patterns, e.g. `"claude-*"`
  - `api_base`: upstream base URL
  - `api_key`: bearer token injected when proxying upstream
  - `https_proxy?`: proxy URL for upstream fetch (per-upstream)
  - `plugins?`: hook names to transform request/response for this upstream

Upstream selection: match by endpoint `type` (i.e., `protocol`), then filter by `models` if provided; the first match is used.

### Built-in plugins

- `patches/cursor-compatible`: improve SSE compatibility with Cursor clients
- `patches/simulate-claude-code-client`: emulate Claude CLI client behavior for better compatibility
- `transformers/openai-to-claude`: translate between OpenAI Chat Completions and Claude Messages (incl. streaming)
- `transformers/ollama-to-openai`: provide Ollama tags/show compatibility backed by an OpenAI-compatible Models API

Plugins are discovered from `patches/` and `transformers/` by filename at startup. Export a `Hook` instance.

### Debugging

1) Build the debug UI (one-time)
```bash
cd debug-ui
pnpm install
pnpm build # outputs to ../public/debug/
```

2) Make a request through the proxy; the server writes logs to `public/log/...` in JSONL:
- A new file is created per request at a path derived from the URL. For example, hitting `/cursor/v1/chat/completions` creates something like `public/log/cursor/v1/chat/completions/<timestamp>.jsonl`.
- Each line is a JSON object with fields like `timestamp`, `leg` (user|upstream), `direction` (request|response), `event` (info|body|chunk), and `payload`.

3) Open the debug UI in your browser:
- `https://<your-host>/debug/` shows the viewer
- Deep-link to a specific log file via query, e.g. `https://<your-host>/debug/?log/cursor/v1/chat/completions/20250808055844815.jsonl`

Notes:
- Port is controlled by `PORT` (default `12000`).
- Static files are served from `public/`.

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
- Static assets are served from `public/`; the debug UI lives at `/debug`

### License

MIT
