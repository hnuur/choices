// Relay entry point: reads operator config from env and listens. Deploy
// target is the operator's choice (see README.md); nothing here is part of
// the PWA build.

import { createRelayServer } from './relay.js'

const upstream = process.env.RELAY_UPSTREAM
const apiKey = process.env.RELAY_API_KEY
if (!upstream || !apiKey) {
  console.error('RELAY_UPSTREAM and RELAY_API_KEY are required')
  process.exit(1)
}

const server = createRelayServer({
  upstream,
  apiKey,
  quota: Number(process.env.RELAY_QUOTA ?? 10),
  model: process.env.RELAY_MODEL ?? '',
})

const port = Number(process.env.PORT ?? 8787)
server.listen(port, () => console.log(`choices relay listening on :${port}`))
