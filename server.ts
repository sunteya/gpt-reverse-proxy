import http from 'http'
import https from 'https'
import { HttpsProxyAgent } from 'https-proxy-agent'
import dotenvFlow from 'dotenv-flow'
import _ from 'lodash'

dotenvFlow.config()

const server = http.createServer((req, res) => {
  console.log(`Request received: ${req.method} ${req.url}`);

  const opts = {
    hostname: 'api.openai.com',
    port: 443,
    path: req.url,
    method: req.method,
    headers: req.headers
  }

  delete opts.headers['host']

  if (!_.isEmpty(process.env.REMOTE_AUTHORIZATION)) {
    opts.headers['authorization'] = process.env.REMOTE_AUTHORIZATION
  }

  if (!_.isEmpty(process.env.https_proxy)) {
    opts['agent'] = new HttpsProxyAgent(process.env.https_proxy!);
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
