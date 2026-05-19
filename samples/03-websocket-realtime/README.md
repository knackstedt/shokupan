# Sample 3: WebSocket Real-time App

A real-time chat application using Shokupan's WebSocket router.

## Features

- `ShokupanWebsocketRouter` for event-based WebSocket handling
- Named events (`chat.message`, `chat.history`, `ping`)
- Message history persistence (in-memory)
- AsyncAPI generation for documentation

## Run

```bash
bun run dev
```

## Test

```bash
bun test
```

## WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| chat.join | server→client | Welcome message on connect |
| chat.message | client→server | Send a chat message |
| chat.broadcast | server→client | Broadcast received message |
| chat.history | client→server | Request message history |
| ping | client→server | Keep-alive ping |
| pong | server→client | Ping response |
