// RideOps load balancer: a dependency-free reverse proxy in front of several API and realtime (WebSocket) replicas.
//  - API pool:      least-connections, active health checks, retry on a different replica when one is down.
//  - Realtime pool: WebSocket upgrades are routed by ride id (?rideId=...), so the driver and the rider of one ride always
//                   land on the same replica (rooms live in that replica's memory). Without a ride id: least-connections.
// Config (env):
//   API_PORT=4000  API_UPSTREAMS=http://127.0.0.1:4001,http://127.0.0.1:4002
//   RT_PORT=4100   RT_UPSTREAMS=http://127.0.0.1:4101,http://127.0.0.1:4102
//   HEALTH_EVERY_MS=5000
// Status page: GET /__lb/status on the API port.
import http from 'node:http'
import net from 'node:net'

const list = (v, fallback) => (v ?? fallback).split(',').map((s) => s.trim()).filter(Boolean)
const HEALTH_EVERY_MS = Number(process.env.HEALTH_EVERY_MS ?? 5000)

function pool(name, urls, healthPath) {
  const nodes = urls.map((u) => { const url = new URL(u); return { url, host: url.hostname, port: Number(url.port || 80), healthy: true, active: 0, served: 0, failures: 0 } })
  const check = (n) => new Promise((resolve) => {
    const req = http.get({ host: n.host, port: n.port, path: healthPath, timeout: 2000 }, (res) => { res.resume(); resolve(res.statusCode === 200) })
    req.on('timeout', () => { req.destroy(); resolve(false) })
    req.on('error', () => resolve(false))
  })
  const sweep = async () => {
    await Promise.all(nodes.map(async (n) => {
      const ok = await check(n)
      if (ok !== n.healthy) console.log(`[lb] ${name} ${n.host}:${n.port} is now ${ok ? 'UP' : 'DOWN'}`)
      n.healthy = ok
    }))
  }
  void sweep()
  setInterval(sweep, HEALTH_EVERY_MS).unref()
  return {
    name, nodes,
    // exclude: replicas already tried for this request. key: stable hash input (ride id) for affinity.
    pick(exclude = [], key) {
      const live = nodes.filter((n) => n.healthy && !exclude.includes(n))
      if (!live.length) return null
      if (key) { let h = 0; for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0; return live[h % live.length] }
      // Fewest in-flight requests; ties go to the replica that has served the least, so idle traffic alternates.
      return live.reduce((best, n) => (n.active < best.active || (n.active === best.active && n.served < best.served) ? n : best))
    },
  }
}

const api = pool('api', list(process.env.API_UPSTREAMS, 'http://127.0.0.1:4001,http://127.0.0.1:4002'), '/api/health')
const rt = pool('realtime', list(process.env.RT_UPSTREAMS, 'http://127.0.0.1:4101,http://127.0.0.1:4102'), '/health')

const REFUSED = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH'])

function proxyHttp(p) {
  return (req, res) => {
    const forwarded = { ...req.headers, 'x-forwarded-for': [req.headers['x-forwarded-for'], req.socket.remoteAddress].filter(Boolean).join(', '), 'x-forwarded-proto': req.headers['x-forwarded-proto'] ?? 'http' }
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks)
      const tried = []
      const attempt = () => {
        const node = p.pick(tried)
        if (!node) { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end('{"error":"No healthy server available. Try again shortly."}'); return }
        tried.push(node)
        node.active++
        const up = http.request({ host: node.host, port: node.port, path: req.url, method: req.method, headers: forwarded, timeout: 30_000 }, (ures) => {
          node.served++
          res.writeHead(ures.statusCode ?? 502, ures.headers)
          ures.pipe(res)
          ures.on('end', () => { node.active-- })
          ures.on('error', () => { node.active--; res.destroy() })
        })
        up.on('timeout', () => up.destroy(new Error('timeout')))
        up.on('error', (err) => {
          node.active--
          // The request never reached a server, so any method can safely go to the next replica.
          if (REFUSED.has(err.code)) { node.healthy = false; node.failures++; console.log(`[lb] ${p.name} ${node.host}:${node.port} refused a connection, marked DOWN`); return attempt() }
          if (!res.headersSent) { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end('{"error":"Bad gateway"}') } else res.destroy()
        })
        up.end(body)
      }
      attempt()
    })
  }
}

function proxyUpgrade(p) {
  return (req, socket, head) => {
    const key = new URL(req.url, 'http://x').searchParams.get('rideId') ?? undefined
    const tried = []
    const attempt = () => {
      const node = p.pick(tried, key)
      if (!node) { socket.end('HTTP/1.1 503 Service Unavailable\r\n\r\n'); return }
      tried.push(node)
      const up = net.connect(node.port, node.host, () => {
        node.active++; node.served++; up.__connected = true
        const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`]
        for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`)
        up.write(lines.join('\r\n') + '\r\n\r\n')
        if (head?.length) up.write(head)
        socket.pipe(up).pipe(socket)
      })
      const done = () => { if (!up.__connected || up.__counted) return; up.__counted = true; node.active = Math.max(0, node.active - 1) }
      up.on('close', () => { done(); socket.destroy() })
      up.on('error', (err) => { if (!up.connecting && up.bytesWritten) { socket.destroy(); return } node.healthy = false; console.log(`[lb] realtime ${node.host}:${node.port} failed (${err.code}), marked DOWN`); attempt() })
      socket.on('close', () => up.destroy())
      socket.on('error', () => up.destroy())
    }
    attempt()
  }
}

const status = () => JSON.stringify({ api: api.nodes.map(({ url, ...n }) => ({ upstream: url.origin, ...n })), realtime: rt.nodes.map(({ url, ...n }) => ({ upstream: url.origin, ...n })) }, null, 2)

const apiPort = Number(process.env.API_PORT ?? 4000)
const apiProxy = proxyHttp(api)
http.createServer((req, res) => {
  if (req.url === '/__lb/status') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(status()); return }
  apiProxy(req, res)
}).listen(apiPort, () => console.log(`[lb] API on :${apiPort} -> ${api.nodes.map((n) => `${n.host}:${n.port}`).join(', ')}`))

const rtPort = Number(process.env.RT_PORT ?? 4100)
const rtServer = http.createServer(proxyHttp(rt))
rtServer.on('upgrade', proxyUpgrade(rt))
rtServer.listen(rtPort, () => console.log(`[lb] realtime on :${rtPort} -> ${rt.nodes.map((n) => `${n.host}:${n.port}`).join(', ')}`))
