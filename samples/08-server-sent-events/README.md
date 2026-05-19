# Sample 8: Server-Sent Events

Demonstrates real-time event streaming using built-in SSE support.

## Features

- SSE stream with `ctx.streamSSE()`
- Automatic event ID tracking
- Sleep helper for timed events
- JSON event history endpoint

## Run

```bash
bun main.ts
```

## Endpoints

- `GET /health` — Health check
- `GET /events` — SSE stream (connect with EventSource)
- `GET /events/history` — Recent events as JSON
- `POST /events` — Create a manual event

## Test SSE

```bash
# In one terminal, stream events
curl -N http://localhost:3008/events

# In another terminal, create events
curl -X POST http://localhost:3008/events \
  -H "Content-Type: application/json" \
  -d '{"message": "hello world"}'

# Get history
curl http://localhost:3008/events/history
```
