// Thin AI proxy per PLAN.md Phase-6: zero-dep node:http server speaking the
// OpenAI-compatible API. Client-generated opaque bearer tokens identify
// devices for the in-memory per-token UTC-day free quota; the operator key
// and upstream endpoint come from env and never reach the client.

import { createServer } from 'node:http'

export const utcDay = (date = new Date()) => date.toISOString().slice(0, 10)

/** In-memory per-token UTC-day quota; rolls over when the day changes. */
export function createQuota(limit, now = () => new Date()) {
  const usage = new Map()
  return {
    take(token) {
      const day = utcDay(now())
      const entry = usage.get(token)
      if (!entry || entry.day !== day) {
        usage.set(token, { day, used: 1 })
        return { ok: true, remaining: limit - 1 }
      }
      if (entry.used >= limit) return { ok: false, remaining: 0 }
      entry.used += 1
      return { ok: true, remaining: limit - entry.used }
    },
  }
}

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })

const sendJson = (res, status, obj) => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(obj))
}

const bearerOf = (req) => {
  const auth = req.headers.authorization ?? ''
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
}

export function createRelayServer({
  upstream,
  apiKey,
  quota = 10,
  model = '',
  now,
  fetchImpl = fetch,
}) {
  const limiter = createQuota(quota, now)
  const base = upstream.replace(/\/+$/, '')

  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost')

    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, { ok: true })
    }

    const token = bearerOf(req)
    if (!token) {
      return sendJson(res, 401, { error: { message: 'Missing bearer token' } })
    }

    // Key-validation round-trip for the app's AI settings; not quota-counted.
    if (req.method === 'GET' && url.pathname === '/models') {
      return sendJson(res, 200, {
        object: 'list',
        data: [{ id: model || 'relay', object: 'model', owned_by: 'relay' }],
      })
    }

    if (req.method === 'POST' && url.pathname === '/chat/completions') {
      if (!limiter.take(token).ok) {
        return sendJson(res, 429, {
          error: {
            message:
              'Daily free quota exhausted — try again tomorrow, or use your own key in AI settings.',
          },
        })
      }
      let payload
      try {
        payload = JSON.parse(await readBody(req))
      } catch {
        return sendJson(res, 400, { error: { message: 'Body must be JSON' } })
      }
      if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        return sendJson(res, 400, { error: { message: 'Body must be a JSON object' } })
      }
      if (model) payload.model = model

      let up
      try {
        up = await fetchImpl(`${base}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payload),
        })
      } catch {
        return sendJson(res, 502, { error: { message: 'Upstream unreachable' } })
      }
      const text = await up.text()
      res.writeHead(up.status, {
        'content-type': up.headers.get('content-type') ?? 'application/json',
      })
      res.end(text)
      return
    }

    return sendJson(res, 404, { error: { message: 'Not found' } })
  })
}
