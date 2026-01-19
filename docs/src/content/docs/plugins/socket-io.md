---
title: Socket.IO Integration
description: Integrate Socket.IO with Shokupan for real-time bidirectional communication.
---

Shokupan provides a seamless integration helper for [Socket.IO](https://socket.io/), allowing you to handle Socket.IO events using Shokupan controllers and leverage the HTTP bridge.

## Installation

You will need to install `socket.io` separately.

```bash
bun add socket.io
```

## Usage

### Attaching to Server

Use the `attachSocketIOBridge` helper to connect a Socket.IO server to your Shokupan application.

```typescript
import { Shokupan, attachSocketIOBridge } from 'shokupan';
import { Server } from 'socket.io';

const app = new Shokupan({
    // If you want to use the HTTP bridge feature
    enableHttpBridge: true
});

const server = await app.listen(3000);

// Initialize Socket.IO with the underlying Node.js server
const io = new Server(server.nodeServer, {
    cors: {
        origin: "*"
    }
});

// Attach the bridge
attachSocketIOBridge(io, app);
```

### Handling Events

You can define event handlers in your controllers using the `@Event` decorator. Shokupan will automatically route Socket.IO events to these handlers.

```typescript
import { Controller, Event, ShokupanContext } from 'shokupan';

@Controller('/chat')
export class ChatController {

    @Event('send_message')
    async onMessage(ctx: ShokupanContext) {
        const payload = await ctx.body();
        console.log('Received:', payload);

        // Access the underlying socket
        const socket = (ctx as any).socket; // or ctx.get('socket')
        
        // Reply
        socket.emit('receive_message', { 
            text: `You said: ${payload.text}` 
        });
    }
}
```

### HTTP Bridge

If `enableHttpBridge` is set to `true` in your Shokupan config, clients can send HTTP-like requests over the WebSocket connection.

**Client-side Example:**
```javascript
socket.emit('shokupan:request', {
    method: 'GET',
    path: '/api/users',
    headers: { 'Authorization': 'Bearer ...' }
}, (response) => {
    console.log(response.status); // 200
    console.log(response.body);   // { users: [...] }
});
```
