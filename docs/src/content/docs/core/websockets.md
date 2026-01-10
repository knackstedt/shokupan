---
title: WebSockets
description: Learn how to handle WebSocket events in Shokupan using native support or Socket.IO.
---

> **Note:** WebSockets support is currently in an experimental stage and may change in the future. You have been warned.

Shokupan provides a unified way to handle WebSocket events using decorators, whether you are using native Bun WebSockets or integrating with libraries like Socket.IO.

## Key Features

- **Decorators**: Use `@Event("name")` to define event handlers in your controllers.
- **Native Support**: Built-in support for Bun's native WebSocket server.
- **HTTP Bridge**: Optionally expose your existing HTTP API over WebSockets to reduce connection overhead.
- **Runtime Agnostic**: Works with both Bun (native) and Node.js (via adapters/Socket.IO).

---

## Defining Events

You can define WebSocket event handlers inside your controllers using the `@Event` decorator.

```typescript
import { Controller, Event, ShokupanContext } from 'shokupan';

@Controller('/chat')
export class ChatController {

    @Event('join')
    onJoin(ctx: ShokupanContext) {
        console.log('User joined room');
        // Reply using the underlying socket
        // For native Bun WebSockets, ctx.socket is the ws instance
        // For Socket.IO, ctx.socket is the socket instance
        ctx.emit("welcome", { message: 'Hello!' });
    }

    @Event('message')
    async onMessage(ctx: ShokupanContext) {
        // The event payload is available via ctx.body()
        const message = await ctx.body();
        console.log('Received:', message);
    }
}
```

### Accessing the Socket

The underlying WebSocket connection is available via `ctx.socket`.
- **Native Bun**: `ctx.socket` is the `ServerWebSocket` instance.
- **Socket.IO**: `ctx.socket` is the `Socket` instance. You also have access to `ctx.io` for the server instance.

---

## Native Bun WebSockets

When running on Bun, Shokupan automatically hooks into `Bun.serve`'s WebSocket handling.

To make this work, the client must follow a simple protocol for sending events:
```json
{
    "type": "EVENT",
    "event": "eventName",
    "data": { ...payload... }
}
```

The server will dispatch these messages to the corresponding `@Event("eventName")` handler.

### Example Setup

```typescript
const app = new Shokupan();

app.mount('/', new ChatController()); // ChatController as seen above

// Or directly listen for WS events on the app
app.event("ping", (ctx) => {
    ctx.emit("pong", { message: Date.now() });
});

app.listen(3000);
```

---

## Socket.IO Integration

Shokupan provides a helper utility to easily integrate Socket.IO, wiring up your `@Event` handlers to Socket.IO events automatically.

### Installation

```bash
bun add socket.io
# or
npm install socket.io
```

### Setup

Use the `attachSocketIOBridge` utility.

```typescript
import { Shokupan, attachSocketIOBridge } from "shokupan";
import { Server } from "socket.io";

const app = new Shokupan({
    enableHttpBridge: true // Optional: enables HTTP-over-WebSocket
});

// For Node.js
const server = await app.listen(3000);
const nodeServer = (server as any).nodeServer;
if (nodeServer) {
    const io = new Server(nodeServer);
    attachSocketIOBridge(io, app);
}

// For Bun
// You can attach to a standalone IO server or use Bun compatibility layers
const io = new Server({ /* ... */ });
attachSocketIOBridge(io, app);
```

With this setup, when a client emits an event:
```javascript
socket.emit('join', { roomId: 1 });
```
The `onJoin` handler in `ChatController` will be executed.

---

## HTTP Bridge (Experimental)

The HTTP Bridge allowing you to call your existing HTTP endpoints (GET/POST/etc.) through a WebSocket connection. This is useful for maintaining a single connection for both real-time events and standard API calls.

### Enabling the Bridge

Set `enableHttpBridge: true` in your Shokupan configuration.

```typescript
const app = new Shokupan({
    enableHttpBridge: true
});
```

### Protocol

**Request:**
Send a message (or emit `shokupan:request` in Socket.IO) with the following structure:

```json
{
    "type": "HTTP", 
    "id": "unique-request-id",
    "method": "GET",
    "path": "/api/users/123",
    "headers": { "Authorization": "Bearer ..." },
    "body": null
}
```

**Response:**
The server will respond with:

```json
{
    "type": "RESPONSE",
    "id": "unique-request-id",
    "status": 200,
    "headers": { ... },
    "body": { "id": 123, "name": "Alice" }
}
```

This allows you to build a wrapper on the client side to use WebSockets as a transport for your fetch calls transparently.
