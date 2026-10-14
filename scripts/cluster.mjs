// Runs the whole backend as a small cluster on one machine, behind the load balancer:
//   2 x API (production build) on :4001 :4002   2 x realtime on :4101 :4102   load balancer on :4000 (API) and :4100 (realtime)
// The apps keep using http://localhost:4000/api and http://localhost:4100, so no frontend change is needed.
// For more than one API replica use a shared Postgres (DATABASE_URL); the file store works locally but can race on writes.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const shell = process.platform === 'win32'

if (!existsSync(path.join(root, 'backend/.next/BUILD_ID'))) {
  console.log('[cluster] building the API once...')
  const b = spawnSync(npx, ['next', 'build'], { cwd: path.join(root, 'backend'), stdio: 'inherit', shell })
  if (b.status !== 0) process.exit(b.status ?? 1)
}

// Production mode needs AUTH_SECRET. Reuse the local one so existing sign-ins keep working.
const secretFile = path.join(root, 'backend/data/.secret')
if (!process.env.AUTH_SECRET && existsSync(secretFile)) process.env.AUTH_SECRET = readFileSync(secretFile, 'utf8').trim()
if (!process.env.AUTH_SECRET) { console.error('[cluster] Set AUTH_SECRET first.'); process.exit(1) }

const children = []
const run = (name, cmd, args, cwd, env = {}) => {
  const child = spawn(cmd, args, { cwd: path.join(root, cwd), env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], shell })
  const tag = (d) => d.toString().split('\n').filter(Boolean).forEach((l) => console.log(`[${name}] ${l}`))
  child.stdout.on('data', tag); child.stderr.on('data', tag)
  child.on('exit', (code) => console.log(`[${name}] exited (${code})`))
  children.push(child)
}

for (const port of [4001, 4002]) run(`api:${port}`, npx, ['next', 'start', '-p', String(port)], 'backend', { INSTANCE_ID: `api-${port}` })
for (const port of [4101, 4102]) run(`rt:${port}`, 'node', ['server.js'], 'realtime', { PORT: String(port), API_URL: 'http://127.0.0.1:4000/api' })
run('lb', 'node', ['server.js'], 'loadbalancer', {
  API_PORT: '4000', RT_PORT: '4100',
  API_UPSTREAMS: 'http://127.0.0.1:4001,http://127.0.0.1:4002',
  RT_UPSTREAMS: 'http://127.0.0.1:4101,http://127.0.0.1:4102',
})

const stop = () => { children.forEach((c) => c.kill()); process.exit(0) }
process.on('SIGINT', stop); process.on('SIGTERM', stop)
