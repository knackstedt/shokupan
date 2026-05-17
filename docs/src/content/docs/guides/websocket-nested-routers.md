---
title: Nested WebSocket Routers
description: How to use nested WebSocket routers in Shokupan.
---

# Nested WebSocket Routers

## Overview

WebSocket routers and controllers can now be mounted onto other WebSocket routers to share the same underlying WebSocket connection. This allows you to organize WebSocket event handlers into modular, reusable components while maintaining a single connection per client.

## Key Features

### ✅ Shared Connection
Multiple WebSocket routers can be mounted onto a parent router, and they all share the same WebSocket connection. This means:
- Only one HTTP upgrade request is needed
- Only one WebSocket connection is established
- All events from all nested routers flow through the same connection

### ✅ Event Prefixing
Events from child routers are automatically prefixed based on their mount path:
```typescript
const mainRouter = new ShokupanWebsocketRouter();
const chatRouter = new ShokupanWebsocketRouter();

chatRouter.event('message', (ctx, data) => {
    // Handle chat message
});

// Mount with prefix "chat"
mainRouter.mount('chat', chatRouter);

// Events are now accessible as "chat.message"
```

### ✅ Lifecycle Handler Merging
Lifecycle handlers from parent and child routers are intelligently merged:

- **onUpgrade**: Parent runs first, then children. Any handler returning `false` rejects the upgrade.
- **onOpen**: Parent runs first, then children. Return values are merged into a single state object.
- **onEvent**: Parent runs first, then children. Any handler returning `false` prevents event routing.
- **onMessage**: All handlers are called in order (parent first, then children).
- **onClose**: All handlers are called in order.
- **onError**: All handlers are called in order.

### ✅ Deep Nesting
Routers can be nested multiple levels deep:
```typescript
const level1 = new ShokupanWebsocketRouter();
const level2 = new ShokupanWebsocketRouter();
const level3 = new ShokupanWebsocketRouter();

level3.event('deepEvent', () => { });
level2.mount('deep', level3);
level1.mount('mid', level2);

// Event is accessible as "mid.deep.deepEvent"
```

### ✅ Controller Support
WebSocket controllers can be mounted onto routers:
```typescript
@WebsocketController()
class ChatController {
    @Event('message')
    handleMessage(ctx: any, data: any) {
        // Handle message
    }
}

const mainRouter = new ShokupanWebsocketRouter();
mainRouter.mount('chat', ChatController);

// Events are accessible as "chat.message"
```

## Usage Example

```typescript
import { Shokupan } from '@shokupan/core';
import { ShokupanWebsocketRouter } from '@shokupan/core';

// Create specialized routers
const chatRouter = new ShokupanWebsocketRouter();
chatRouter.event('message', (ctx, data) => {
    ctx.broadcast('chat.message', data);
});

const notificationRouter = new ShokupanWebsocketRouter();
notificationRouter.event('subscribe', (ctx, data) => {
    ctx.emit('notifications.subscribed', data);
});

// Create main router with authentication
const mainRouter = new ShokupanWebsocketRouter();

mainRouter.onUpgrade((ctx) => {
    const token = ctx.get('authorization');
    if (!token) return false; // Reject upgrade
    return true;
});

mainRouter.onOpen((ctx, ws) => {
    return {
        userId: ctx.get('x-user-id'),
        connectedAt: Date.now()
    };
});

// Mount child routers - they share the same connection!
mainRouter.mount('chat', chatRouter);
mainRouter.mount('notifications', notificationRouter);

// Mount to app - creates ONE WebSocket endpoint
const app = new Shokupan();
app.mount('/ws', mainRouter);

// Client connects to ws://localhost:3000/ws
// Client can send:
// - { "event": "chat.message", "data": {...} }
// - { "event": "notifications.subscribe", "data": {...} }
```

## Client-Side Usage

```javascript
const ws = new WebSocket('ws://localhost:3000/ws');

ws.onopen = () => {
    // Send events with prefixed names
    ws.send(JSON.stringify({
        event: 'chat.message',
        data: { text: 'Hello!' }
    }));
    
    ws.send(JSON.stringify({
        event: 'notifications.subscribe',
        data: { channel: 'updates' }
    }));
};

ws.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    console.log('Received:', payload.event, payload.data);
};
```

## Benefits

1. **Modularity**: Organize WebSocket logic into separate, focused routers
2. **Reusability**: Share router modules across different applications
3. **Efficiency**: Single connection reduces overhead
4. **Maintainability**: Clear separation of concerns
5. **Flexibility**: Mix routers and controllers as needed

## Migration from Separate Endpoints

**Before** (multiple connections):
```typescript
app.mount('/chat', chatRouter);        // ws://localhost/chat
app.mount('/notifications', notifRouter); // ws://localhost/notifications
// Client needs 2 WebSocket connections
```

**After** (single connection):
```typescript
const mainRouter = new ShokupanWebsocketRouter();
mainRouter.mount('chat', chatRouter);
mainRouter.mount('notifications', notifRouter);
app.mount('/ws', mainRouter);          // ws://localhost/ws
// Client needs only 1 WebSocket connection
```

## See Also

- [WebSocket Router API](./websocket-router.md)
- [WebSocket Controller Decorators](./websocket-decorators.md)
- [Example: Nested Routers](../examples/websocket-nested-routers.ts)
