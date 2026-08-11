// Relay battery (PLAN.md Phase-6 verify: "relay quota enforced"): real HTTP
// against a stub upstream, zero mocks of the relay itself.

import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, before, describe, it } from 'node:test'
import { createQuota, createRelayServer, utcDay } from './relay.js'

const listen = (server) =>
  new Promise((resolve) => server.listen(0, () => resolve(server.address().port)))

let upstream
let upstreamPort
let seen

before(async () => {
  upstream = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      seen.push({ auth: req.headers.authorization, body: JSON.parse(body) })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'ok' } }] }))
    })
  })
  upstreamPort = await listen(upstream)
})

after(() => upstream.close())

async function startRelay(overrides = {}) {
  const relay = createRelayServer({
    upstream: `http://127.0.0.1:${upstreamPort}/v1`,
    apiKey: 'operator-key',
    quota: 2,
    model: 'fixed-model',
    ...overrides,
  })
  const port = await listen(relay)
  return { relay, url: `http://127.0.0.1:${port}` }
}

describe('relay', () => {
  it('health needs no auth', async () => {
    const { relay, url } = await startRelay()
    const res = await fetch(`${url}/health`)
    assert.equal(res.status, 200)
    await relay.close()
  })

  it('rejects requests without a bearer token', async () => {
    const { relay, url } = await startRelay()
    const res = await fetch(`${url}/chat/completions`, { method: 'POST', body: '{}' })
    assert.equal(res.status, 401)
    const body = await res.json()
    assert.match(body.error.message, /token/i)
    await relay.close()
  })

  it('/models validates a token without touching the quota', async () => {
    const { relay, url } = await startRelay({ quota: 1 })
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${url}/models`, { headers: { authorization: 'Bearer tok' } })
      assert.equal(res.status, 200)
      const body = await res.json()
      assert.equal(body.data[0].id, 'fixed-model')
    }
    await relay.close()
  })

  it('forwards with the operator key, never the client token, and pins the model', async () => {
    seen = []
    const { relay, url } = await startRelay()
    const res = await fetch(`${url}/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer device-token' },
      body: JSON.stringify({ model: 'whatever', messages: [{ role: 'user', content: 'hi' }] }),
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.choices[0].message.content, 'ok')
    assert.equal(seen[0].auth, 'Bearer operator-key')
    assert.equal(seen[0].body.model, 'fixed-model')
    await relay.close()
  })

  it('enforces the per-token daily quota and names the remedy', async () => {
    const { relay, url } = await startRelay({ quota: 2 })
    const post = () =>
      fetch(`${url}/chat/completions`, {
        method: 'POST',
        headers: { authorization: 'Bearer device-token' },
        body: JSON.stringify({ messages: [] }),
      })
    assert.equal((await post()).status, 200)
    assert.equal((await post()).status, 200)
    const third = await post()
    assert.equal(third.status, 429)
    const body = await third.json()
    assert.match(body.error.message, /quota/i)
    assert.match(body.error.message, /your own key/i)
    // A different token still has quota.
    const other = await fetch(`${url}/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer other-token' },
      body: JSON.stringify({ messages: [] }),
    })
    assert.equal(other.status, 200)
    await relay.close()
  })

  it('rejects non-JSON bodies', async () => {
    const { relay, url } = await startRelay()
    const res = await fetch(`${url}/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer tok' },
      body: 'not json',
    })
    assert.equal(res.status, 400)
    await relay.close()
  })

  it('quota 0 grants no free requests', async () => {
    const { relay, url } = await startRelay({ quota: 0 })
    const res = await fetch(`${url}/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer tok' },
      body: JSON.stringify({ messages: [] }),
    })
    assert.equal(res.status, 429)
    await relay.close()
  })

  it('rejects bodies over 1 MB', async () => {
    const { relay, url } = await startRelay()
    const res = await fetch(`${url}/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer tok' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'x'.repeat(1.5 * 1024 * 1024) }] }),
    })
    assert.equal(res.status, 413)
    await relay.close()
  })

  it('passes upstream error statuses through', async () => {
    const failing = createServer((req, res) => {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'upstream broke' } }))
    })
    const failingPort = await listen(failing)
    const { relay, url } = await startRelay({ upstream: `http://127.0.0.1:${failingPort}` })
    const res = await fetch(`${url}/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer tok' },
      body: JSON.stringify({ messages: [] }),
    })
    assert.equal(res.status, 500)
    await relay.close()
    await failing.close()
  })
})

describe('createQuota', () => {
  it('rolls over on the UTC day boundary', () => {
    let current = new Date('2026-08-11T23:59:00Z')
    const quota = createQuota(1, () => current)
    assert.equal(quota.take('t').ok, true)
    assert.equal(quota.take('t').ok, false)
    current = new Date('2026-08-12T00:01:00Z')
    assert.equal(quota.take('t').ok, true)
  })

  it('utcDay formats as YYYY-MM-DD', () => {
    assert.equal(utcDay(new Date('2026-08-11T15:00:00Z')), '2026-08-11')
  })
})
