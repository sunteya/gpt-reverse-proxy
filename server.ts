import http from 'http'
import https from 'https'
import { HttpsProxyAgent } from 'https-proxy-agent'
import dotenvFlow from 'dotenv-flow'
import _ from 'lodash'
import { URL } from 'url'

dotenvFlow.config()

interface Config {
  remote_url: string
  remote_authorization: string | null

  local_auth_token: string | null
  local_path_prefix: string

  https_proxy: string | null
}

const config = {} as Config
for (const key of [ 'LOCAL_PATH_PREFIX', 'LOCAL_AUTH_TOKEN', 'REMOTE_URL', 'REMOTE_AUTHORIZATION', 'https_proxy' ]) {
  const value = process.env[key]
  config[key.toLowerCase()] = _.isEmpty(value) ? null : value
}
config.local_path_prefix ||= "/"


const remoteUrl = new URL(config.remote_url);
if (remoteUrl.protocol != "https:") {
  throw new Error("Only https is supported")
}

const server = http.createServer((req, res) => {
  console.log(`Request received: ${req.method} ${req.url}`);

  if (config.local_auth_token && !_.includes(req.headers.authorization, config.local_auth_token)) {
    console.log("Request auth token is invalid")
    res.statusCode = 401
    res.end("Unauthorized")
    return
  }

  let path = req.url
  if (!_.startsWith(path, config.local_path_prefix)) {
    res.statusCode = 404
    res.end("Not found")
    return
  }

  path = _.trimStart(path, config.local_path_prefix)
  path = remoteUrl.pathname + path

  const opts = {
    hostname: remoteUrl.hostname,
    port: parseInt(remoteUrl.port) || 443,
    path: path,
    method: req.method,
    headers: req.headers
  }

  delete opts.headers['host']

  if (config.remote_authorization) {
    opts.headers['authorization'] = config.remote_authorization
  }

  if (config.https_proxy) {
    opts['agent'] = new HttpsProxyAgent(config.https_proxy);
  }

  const proxyReq = https.request(opts, (proxyRes) => {
    console.log(`Proxy response received: ${proxyRes.statusCode} ${proxyRes.statusMessage}`);
    res.writeHead(proxyRes.statusCode || 500, proxyRes.headers)

    proxyRes.on('data', (chunk) => {
      console.log(`Received data from proxy: ${chunk}`);
      res.write(chunk);
    });

    proxyRes.on('end', () => {
      console.log('Proxy response ended');
      res.end();
    });
  })

  req.on('data', (chunk) => {
    console.log(`Received data from client: ${chunk}`);
    proxyReq.write(chunk);
  });

  req.on('end', () => {
    console.log('Request ended');
    proxyReq.end();
  });
})

server.listen(3000, () => {
  console.log('Proxy server listening on port 3000');
});
