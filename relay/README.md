# Choices relay

Optional thin AI proxy for zero-setup use (PLAN.md Phase-6). The PWA talks
to it in relay mode; it holds the operator's provider key and hands out a
daily free quota per device.

## What it is

- Zero-dependency Node (>= 18) ESM server speaking the OpenAI-compatible API.
- Devices identify with a client-generated opaque bearer token (the app
  creates one per install); the quota is counted per token per UTC day, in
  memory (a restart resets quotas — accepted for v1).
- The operator key and upstream endpoint live in env and never reach
  clients; the relay swaps auth and pins the model before forwarding.

## Run

```sh
RELAY_UPSTREAM=https://api.openai.com/v1 \
RELAY_API_KEY=sk-... \
RELAY_QUOTA=10 \
RELAY_MODEL=gpt-4o-mini \
PORT=8787 \
node server.js
```

| Env              | Meaning                                            |
| ---------------- | -------------------------------------------------- |
| `RELAY_UPSTREAM` | OpenAI-compatible base URL to forward to           |
| `RELAY_API_KEY`  | the operator's key for that upstream               |
| `RELAY_QUOTA`    | chat requests per token per UTC day (default 10; 0 disables free use) |
| `RELAY_MODEL`    | if set, overrides the model in every request       |
| `PORT`           | listen port (default 8787)                         |

Endpoints: `POST /chat/completions` (quota-counted), `GET /models`
(key-validation round-trip, free), `GET /health` (no auth).

Deploy target is the operator's choice — anything that runs Node.

## Test

```sh
npm test   # node --test, real HTTP against a stub upstream
```
