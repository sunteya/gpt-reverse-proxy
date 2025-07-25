import dotenvFlow from "dotenv-flow"

dotenvFlow.config()

const config = {
  upstream_url: null! as string,
  upstream_authorization: null as string | null,
  https_proxy: null as string | null,
  log_level: "info" as string,

  local_path_prefix: null as string | null,
  local_auth_token: null as string | null,
  local_ollama_secret: 'ollama' as string | null,
}

for (const key in config) {
  const value = process.env[key] ?? process.env[key.toUpperCase()]
  if (value === '') {
    if (config[key] == null) {
      config[key] = value
    }
  } else if (value !== undefined) {
    config[key] = value
  }
}

export default config
