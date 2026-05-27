---
title: WebSockets
description: Build real-time applications with Shokupan's first-class WebSocket support using routers, controllers, and decorators.
---

Shokupan provides **first-class WebSocket support** with three flexible approaches: decorator-based controllers, functional routers, and inline handlers. All approaches are fully interoperable and work seamlessly with Bun's native WebSocket implementation.

> **Note:** WebSocket support is currently in an experimental stage and may change in future releases.

## Why Shokupan WebSockets?

- **Three Patterns**: Choose between controllers (`@WebsocketController`), routers (`ShokupanWebsocketRouter`), or inline handlers (`ctx.upgrade()`)
- **Nested Routers**: Mount multiple WebSocket routers onto a parent router to share a single connection
- **Full Lifecycle Control**: Handle upgrade, open, message, event, close, and error events
- **Type-Safe**: Full TypeScript support with excellent type inference
- **Native Performance**: Built on Bun's high-performance WebSocket implementation
- **Event-Based**: Structured event routing with `@Event()` decorators or `.event()` methods
- **Binary Support**: No strict payload format - supports JSON, protobuf, msgpack, and any binary format
- **HTTP Bridge**: Optional HTTP-over-WebSocket for unified API access
- **Socket.IO Compatible**: Easy integration with Socket.IO

---

## Quick Start

Here's a simple WebSocket echo server using the controller pattern:

```typescript
import { Shokupan, WebsocketController, OnOpen, OnMessage } from 'shokupan';

@WebsocketController()
class EchoController {
    @OnOpen()
    handleOpen(ctx, ws) {
        console.log('Client connected');
        return { connectedAt: Date.now() };
    }

    @OnMessage()
    handleMessage(ctx, ws, message) {
        ws.send(message); // Echo back
    }
}

const app = new Shokupan();
app.mount('/echo', EchoController);
app.listen(3000);
```

---

## Three Approaches to WebSockets

Shokupan offers three ways to handle WebSockets, all fully interoperable:

### 1. Controller Pattern (Decorator-Based)

Best for structured, enterprise applications with complex event handling.

```typescript
import { WebsocketController, OnOpen, OnClose, Event } from 'shokupan';

@WebsocketController()
class ChatController {
    @OnOpen()
    handleOpen(ctx, ws) {
        return { userId: ctx.query.userId, joinedAt: Date.now() };
    }

    @Event('chat.message')
    handleMessage(ctx, data) {
        ctx.broadcast('chat.message', {
            user: ctx.state.userId,
            message: data.text,
            timestamp: Date.now()
        });
    }

    @Event('chat.typing')
    handleTyping(ctx, data) {
        ctx.broadcast('chat.typing', { user: ctx.state.userId });
    }

    @OnClose()
    handleClose(ctx, ws) {
        console.log(`User ${ctx.state.userId} disconnected`);
    }
}

app.mount('/chat', ChatController);
```

### 2. Router Pattern (Functional)

Best for simple APIs and rapid prototyping.

```typescript
import { ShokupanWebsocketRouter } from 'shokupan';

const chatRouter = new ShokupanWebsocketRouter();

chatRouter.onOpen((ctx, ws) => {
    return { userId: ctx.query.userId, joinedAt: Date.now() };
});

chatRouter.event('chat.message', (ctx, data) => {
    ctx.broadcast('chat.message', {
        user: ctx.state.userId,
        message: data.text,
        timestamp: Date.now()
    });
});

chatRouter.event('chat.typing', (ctx, data) => {
    ctx.broadcast('chat.typing', { user: ctx.state.userId });
});

chatRouter.onClose((ctx, ws) => {
    console.log(`User ${ctx.state.userId} disconnected`);
});

app.mount('/chat', chatRouter);
```

### 3. Inline Handlers

Best for simple WebSocket endpoints with minimal logic.

```typescript
app.get('/echo', (ctx) => {
    ctx.upgrade({
        open: (ctx, ws) => {
            ws.send('Connected!');
        },
        message: (ctx, ws, msg) => {
            ws.send(msg); // Echo back
        },
        close: (ctx, ws) => {
            console.log('Client disconnected');
        }
    });
});
```

---

## WebSocket Controller API

The `@WebsocketController` decorator provides a complete lifecycle API for WebSocket connections.

### Available Decorators

| Decorator | Purpose | Return Value |
|-----------|---------|--------------|
| `@WebsocketController(path?)` | Marks a class as a WebSocket controller | - |
| `@OnUpgrade()` | Validates upgrade requests | `false` to reject, `true` or `undefined` to accept |
| `@OnOpen()` | Handles connection open | Object is set to `ctx.state` and `ws.data` |
| `@OnEvent()` | Middleware for all events | `false` to prevent routing |
| `@OnMessage()` | Handles raw messages | - |
| `@Event(name)` | Handles specific events | - |
| `@OnClose()` | Handles connection close | - |
| `@OnError()` | Handles errors | - |

### Complete Controller Example

```typescript
import { 
    WebsocketController, 
    OnUpgrade, 
    OnOpen, 
    OnEvent,
    OnMessage,
    Event, 
    OnClose, 
    OnError 
} from 'shokupan';

@WebsocketController()
class FullFeaturedController {
    // Validate upgrade request
    @OnUpgrade()
    handleUpgrade(ctx) {
        const token = ctx.query.token;
        if (!isValidToken(token)) {
            return false; // Reject upgrade
        }
        return true;
    }

    // Initialize connection
    @OnOpen()
    handleOpen(ctx, ws) {
        const userId = getUserIdFromToken(ctx.query.token);
        console.log(`User ${userId} connected`);
        
        // Return value is stored in ctx.state and ws.data
        return { 
            userId, 
            connectedAt: Date.now(),
            permissions: ['read', 'write']
        };
    }

    // Event middleware - runs before specific event handlers
    @OnEvent()
    handleEvent(ctx, ws, eventName, data) {
        console.log(`Event: ${eventName}`, data);
        
        // Block private events
        if (eventName.startsWith('_')) {
            return false; // Prevent routing
        }
        
        // Check permissions
        if (!ctx.state.permissions.includes('write')) {
            ctx.emit('error', { message: 'Insufficient permissions' });
            return false;
        }
    }

    // Raw message handler - runs for every message
    @OnMessage()
    handleMessage(ctx, ws, message) {
        console.log('Raw message:', message);
    }

    // Specific event handlers
    @Event('user.join')
    handleUserJoin(ctx, data) {
        ctx.broadcast('user.joined', {
            userId: ctx.state.userId,
            room: data.room
        });
    }

    @Event('message.send')
    handleMessageSend(ctx, data) {
        ctx.broadcast('message.new', {
            from: ctx.state.userId,
            text: data.text,
            timestamp: Date.now()
        });
    }

    @Event('user.typing')
    handleTyping(ctx, data) {
        ctx.broadcast('user.typing', {
            userId: ctx.state.userId
        });
    }

    // Connection close
    @OnClose()
    handleClose(ctx, ws, code, reason) {
        console.log(`User ${ctx.state.userId} disconnected: ${code} ${reason}`);
    }

    // Error handling
    @OnError()
    handleError(ctx, ws, error) {
        console.error('WebSocket error:', error);
    }
}

app.mount('/ws', FullFeaturedController);
```

---

## WebSocket Router API

The `ShokupanWebsocketRouter` provides a functional API for WebSocket handling.

### Available Methods

```typescript
const router = new ShokupanWebsocketRouter();

// Lifecycle hooks
router.onUpgrade((ctx) => boolean);
router.onOpen((ctx, ws) => object);
router.onEvent((ctx, ws, event, data) => boolean);
router.onMessage((ctx, ws, message) => void);
router.onClose((ctx, ws, code, reason) => void);
router.onError((ctx, ws, error) => void);

// Event handlers
router.event(eventName, (ctx, data) => void);

// Nested mounting (NEW)
router.mount(prefix, childRouter); // Mount child router/controller

// Utility
router.getEvents(); // Returns Map of registered events
router.getAllEvents(); // Returns all events including from children
router.getAllHandlers(); // Returns merged lifecycle handlers
ShokupanWebsocketRouter.isWebSocketRouter(obj); // Type guard
```

### Complete Router Example

```typescript
import { ShokupanWebsocketRouter } from 'shokupan';

const notificationRouter = new ShokupanWebsocketRouter();

// Validate upgrade
notificationRouter.onUpgrade((ctx) => {
    const apiKey = ctx.get('x-api-key');
    return isValidApiKey(apiKey);
});

// Initialize connection
notificationRouter.onOpen((ctx, ws) => {
    const userId = getUserFromApiKey(ctx.get('x-api-key'));
    subscribeToNotifications(userId, ws);
    
    return { userId, subscribedAt: Date.now() };
});

// Event middleware
notificationRouter.onEvent((ctx, ws, event, data) => {
    // Rate limiting
    if (isRateLimited(ctx.state.userId)) {
        ctx.emit('error', { message: 'Rate limit exceeded' });
        return false;
    }
});

// Event handlers
notificationRouter.event('subscribe', (ctx, data) => {
    const { channel } = data;
    subscribeToChannel(ctx.state.userId, channel);
    ctx.emit('subscribed', { channel });
});

notificationRouter.event('unsubscribe', (ctx, data) => {
    const { channel } = data;
    unsubscribeFromChannel(ctx.state.userId, channel);
    ctx.emit('unsubscribed', { channel });
});

// Cleanup on close
notificationRouter.onClose((ctx, ws) => {
    unsubscribeAll(ctx.state.userId);
});

app.mount('/notifications', notificationRouter);
```

---

## Context Helpers

The `ShokupanContext` provides several WebSocket-specific helpers:

### ctx.emit()

Send an event to the current client:

```typescript
@Event('ping')
handlePing(ctx) {
    ctx.emit('pong', { timestamp: Date.now() });
}
```

### ctx.broadcast()

Send an event to all connected clients:

```typescript
@Event('chat.message')
handleMessage(ctx, data) {
    ctx.broadcast('chat.message', {
        user: ctx.state.userId,
        text: data.text
    });
}
```

### ctx.socket

Access the underlying WebSocket instance:

```typescript
@OnOpen()
handleOpen(ctx, ws) {
    // ws is the same as ctx.socket
    ctx.socket.send('Direct message');
    
    // For Bun: ctx.socket is ServerWebSocket
    // For Socket.IO: ctx.socket is Socket
}
```

### ctx.state

Shared state object available across all handlers:

```typescript
@OnOpen()
handleOpen(ctx, ws) {
    // Return value is merged into ctx.state
    return { userId: '123', role: 'admin' };
}

@Event('message')
handleMessage(ctx, data) {
    // Access state from onOpen
    console.log(ctx.state.userId); // '123'
    console.log(ctx.state.role);   // 'admin'
}
```

### ctx.upgrade()

Upgrade an HTTP request to WebSocket (inline handler pattern):

```typescript
app.get('/ws', (ctx) => {
    ctx.upgrade({
        open: (ctx, ws) => { },
        message: (ctx, ws, msg) => { },
        close: (ctx, ws) => { }
    });
});
```

---

## Client-Side Protocol

When using native Bun WebSockets, clients must send messages in a specific JSON format.

### Event Message Format

Shokupan recognizes multiple envelope formats for flexibility:

**Option 1: Using `event` field**
```json
{
    "event": "chat.message",
    "data": { "text": "Hello!" }
}
```

**Option 2: Using `type` and `name` fields**
```json
{
    "type": "EVENT",
    "name": "chat.message",
    "data": { "text": "Hello!" }
}
```

### Data Extraction

The event data is extracted in this order:

1. **Explicit data fields**: `data`, `body`, or `payload`
2. **Fallback**: The entire message object (excluding `event`/`type`/`name`)

**Examples:**

```json
// Explicit data field
{ "event": "ping", "data": { "timestamp": 123 } }

// Body field
{ "event": "ping", "body": { "timestamp": 123 } }

// Payload field
{ "event": "ping", "payload": { "timestamp": 123 } }

// Fallback - entire object is data
{ "event": "ping", "timestamp": 123 }
// Data will be: { "timestamp": 123 }
```

### Client Example (JavaScript)

```javascript
const ws = new WebSocket('ws://localhost:3000/chat');

ws.onopen = () => {
    // Send event
    ws.send(JSON.stringify({
        event: 'user.join',
        data: { room: 'general' }
    }));
};

ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    console.log('Received:', message);
};

// Send chat message
function sendMessage(text) {
    ws.send(JSON.stringify({
        event: 'chat.message',
        data: { text }
    }));
}
```

### Client Example (TypeScript)

```typescript
interface WebSocketMessage<T = any> {
    event: string;
    data?: T;
}

class ChatClient {
    private ws: WebSocket;

    constructor(url: string) {
        this.ws = new WebSocket(url);
        this.ws.onmessage = this.handleMessage.bind(this);
    }

    send<T>(event: string, data?: T) {
        this.ws.send(JSON.stringify({ event, data }));
    }

    private handleMessage(event: MessageEvent) {
        const message: WebSocketMessage = JSON.parse(event.data);
        console.log(`Event: ${message.event}`, message.data);
    }
}

const client = new ChatClient('ws://localhost:3000/chat');
client.send('user.join', { room: 'general' });
```

---

## Advanced Features

### Authentication & Authorization

Validate connections in the `@OnUpgrade()` handler:

```typescript
@WebsocketController()
class SecureController {
    @OnUpgrade()
    handleUpgrade(ctx) {
        // Check token in query params
        const token = ctx.query.token;
        if (!isValidToken(token)) {
            return false; // Reject upgrade
        }
        
        // Or check in headers
        const authHeader = ctx.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return false;
        }
        
        return true;
    }

    @OnOpen()
    handleOpen(ctx, ws) {
        const userId = getUserFromToken(ctx.query.token);
        return { userId, authenticated: true };
    }
}
```

### Room/Channel Management

Implement pub/sub patterns with Bun's built-in publish/subscribe:

```typescript
@WebsocketController()
class RoomController {
    @Event('room.join')
    handleJoinRoom(ctx, data) {
        const { room } = data;
        
        // Subscribe to room
        ctx.socket.subscribe(room);
        
        // Notify room
        ctx.socket.publish(room, JSON.stringify({
            event: 'user.joined',
            data: { userId: ctx.state.userId }
        }));
    }

    @Event('room.leave')
    handleLeaveRoom(ctx, data) {
        const { room } = data;
        ctx.socket.unsubscribe(room);
        
        ctx.socket.publish(room, JSON.stringify({
            event: 'user.left',
            data: { userId: ctx.state.userId }
        }));
    }

    @Event('room.message')
    handleRoomMessage(ctx, data) {
        const { room, text } = data;
        
        // Publish to all subscribers
        ctx.socket.publish(room, JSON.stringify({
            event: 'message',
            data: {
                user: ctx.state.userId,
                text,
                timestamp: Date.now()
            }
        }));
    }
}
```

### Event Middleware & Validation

Use `@OnEvent()` for cross-cutting concerns:

```typescript
@WebsocketController()
class ValidatedController {
    @OnEvent()
    handleEvent(ctx, ws, eventName, data) {
        // Rate limiting
        if (this.isRateLimited(ctx.state.userId)) {
            ctx.emit('error', { message: 'Rate limit exceeded' });
            return false; // Block event
        }
        
        // Permission checking
        if (!this.hasPermission(ctx.state.userId, eventName)) {
            ctx.emit('error', { message: 'Insufficient permissions' });
            return false;
        }
        
        // Logging
        console.log(`[${ctx.state.userId}] ${eventName}`, data);
        
        return true; // Allow event to proceed
    }

    @Event('protected.action')
    handleProtectedAction(ctx, data) {
        // Only reached if @OnEvent() returns true
    }
}
```

### Multiple WebSocket Endpoints

Mount different controllers/routers on different paths:

```typescript
const app = new Shokupan();

// Chat endpoint
@WebsocketController()
class ChatController { /* ... */ }
app.mount('/chat', ChatController);

// Notifications endpoint
const notificationRouter = new ShokupanWebsocketRouter();
notificationRouter.event('subscribe', (ctx, data) => { /* ... */ });
app.mount('/notifications', notificationRouter);

// Admin endpoint
app.get('/admin/ws', (ctx) => {
    if (!ctx.state.isAdmin) {
        return ctx.text('Forbidden', 403);
    }
    
    ctx.upgrade({
        open: (ctx, ws) => { /* ... */ }
    });
});

app.listen(3000);
```

### Nested WebSocket Routers (NEW)

Mount multiple WebSocket routers onto a parent router to share a single connection. Events are automatically prefixed based on the mount path:

```typescript
import { ShokupanWebsocketRouter, WebsocketController, Event } from 'shokupan';

// Create specialized routers
const chatRouter = new ShokupanWebsocketRouter();
chatRouter.event('message', (ctx, data) => {
    ctx.broadcast('chat.message', data);
});
chatRouter.event('typing', (ctx, data) => {
    ctx.broadcast('chat.typing', data);
});

const notificationRouter = new ShokupanWebsocketRouter();
notificationRouter.event('subscribe', (ctx, data) => {
    ctx.emit('notifications.subscribed', data);
});

// Or use controllers
@WebsocketController()
class PresenceController {
    @Event('online')
    handleOnline(ctx, data) {
        ctx.broadcast('presence.online', data);
    }
}

// Create main router with shared authentication
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

// Mount child routers - they share the same WebSocket connection!
mainRouter.mount('chat', chatRouter);
mainRouter.mount('notifications', notificationRouter);
mainRouter.mount('presence', PresenceController);

// Mount to app - creates ONE WebSocket endpoint at /ws
app.mount('/ws', mainRouter);

// Client connects to: ws://localhost:3000/ws
// Client can send:
// - { "event": "chat.message", "data": {...} }
// - { "event": "chat.typing", "data": {...} }
// - { "event": "notifications.subscribe", "data": {...} }
// - { "event": "presence.online", "data": {...} }
```

**Benefits of Nested Routers:**
- **Single Connection**: All routers share one WebSocket connection
- **Modular Organization**: Separate concerns into focused routers
- **Event Prefixing**: Events are automatically namespaced (e.g., `chat.message`)
- **Shared Lifecycle**: Parent handlers run before children (authentication, logging, etc.)
- **Deep Nesting**: Routers can be nested multiple levels deep

**Lifecycle Handler Merging:**
- `onUpgrade`: Parent runs first, then children. Any `false` rejects the upgrade.
- `onOpen`: Parent runs first, then children. Return values are merged into state.
- `onEvent`: Parent runs first, then children. Any `false` prevents event routing.
- `onMessage`, `onClose`, `onError`: All handlers are called in order (parent first).

See the [Nested WebSocket Routers Guide](../guides/websocket-nested-routers.md) for more details.

---

## Native Bun WebSockets

When running on Bun, Shokupan automatically hooks into `Bun.serve`'s WebSocket handling for optimal performance.

### Direct App-Level Events

You can also register events directly on the app instance:

```typescript
const app = new Shokupan();

// App-level event handler
app.event("ping", (ctx) => {
    ctx.emit("pong", { timestamp: Date.now() });
});

// Works alongside controllers and routers
app.mount('/chat', ChatController);

app.listen(3000);
```

### WebSocket Compression

Bun supports WebSocket compression out of the box:

```typescript
const app = new Shokupan({
    websocket: {
        perMessageDeflate: true,
        maxPayloadLength: 16 * 1024 * 1024, // 16MB
        idleTimeout: 120, // seconds
        backpressureLimit: 1024 * 1024 // 1MB
    }
});
```

---

## Middleware and WebSocket Upgrades

**✅ Verified Behavior**: Middleware runs **before** WebSocket upgrade handling. The initial HTTP upgrade request must satisfy all middleware before the WebSocket connection is established.

This means:
- Authentication middleware can validate tokens before upgrade
- Rate limiting applies to WebSocket connection attempts
- CORS headers are set on the upgrade response
- Any middleware that returns a response will prevent the upgrade

### Request Flow

When a WebSocket upgrade request arrives:

1. **Middleware chain executes** (CORS, auth, rate limiting, etc.)
2. **WebSocket upgrade check** (if `Upgrade: websocket` header present)
3. **Route matching** (only if not upgraded)

### Best Practices for Middleware

If your middleware needs to handle WebSocket upgrade requests specially, check for the `Upgrade` header:

```typescript
export function MyMiddleware() {
    return async (ctx, next) => {
        const isWebSocket = ctx.req.headers.get('upgrade')?.toLowerCase() === 'websocket';
        
        if (isWebSocket) {
            // Skip certain operations for WebSocket upgrades
            // e.g., don't parse body, don't set certain headers
            return next();
        }
        
        // Normal HTTP request handling
        // ...
        return next();
    };
}
```

### Common Middleware Scenarios

**✅ Safe for WebSocket upgrades:**
- **CORS**: Works correctly with WebSocket handshakes
- **Authentication**: Can validate tokens in upgrade requests
- **Rate Limiting**: Applies to connection attempts
- **Logging**: Records upgrade requests

**⚠️ Requires awareness:**
- **Body parsing**: Don't parse bodies on GET requests (including WebSocket handshakes)
- **Response modification**: Don't set response headers/body before calling `next()`
- **Early returns**: Ensure middleware calls `next()` for upgrade requests

### Example: Auth Middleware for WebSockets

```typescript
export function WebSocketAuth() {
    return async (ctx, next) => {
        const isWebSocket = ctx.req.headers.get('upgrade')?.toLowerCase() === 'websocket';
        
        if (isWebSocket) {
            // Check token in query params or custom header
            const token = ctx.query.token || ctx.req.headers.get('sec-websocket-protocol');
            
            if (!isValidToken(token)) {
                // Reject the upgrade
                return ctx.text('Unauthorized', 401);
            }
        }
        
        return next();
    };
}
```

> **Note**: WebSocket upgrade requests use the HTTP GET method with an `Upgrade: websocket` header. They cannot have a request body, so authentication must use headers, query parameters, or cookies.

### Verified Implementation Details

**✅ Connection Sharing**: Multiple WebSocket routers mounted on different paths create separate connections. To share a connection, use nested mounting (see [Nested WebSocket Routers](#nested-websocket-routers-new)).

**✅ Middleware Execution**: The initial HTTP upgrade request passes through the full middleware chain before the WebSocket connection is established.

**✅ Payload Format**: There is **no strict format** for WebSocket payloads. The framework supports:
- **JSON messages** for event routing (parsed automatically)
- **Binary messages** (ArrayBuffer, Buffer) passed directly to `onMessage` handlers
- **Protobuf, msgpack, or any custom format** - handle in your `onMessage` handler

```typescript
// Binary message handling
router.onMessage((ctx, ws, message) => {
    if (message instanceof ArrayBuffer || message instanceof Buffer) {
        // Handle binary data (protobuf, msgpack, etc.)
        const decoded = decodeProtobuf(message);
        // Process decoded data
    } else if (typeof message === 'string') {
        // Handle text/JSON data
    }
});
```

**✅ Nested Router Mounting**: WebSocket routers and controllers can be mounted onto other WebSocket routers to share the same underlying connection. Events are automatically prefixed, and lifecycle handlers are intelligently merged.

---

## Socket.IO Integration

When you need Socket.IO compatibility, Shokupan provides seamless integration.

### Installation

```bash
bun add socket.io
# or
npm install socket.io
```

### Setup

```typescript
import { Shokupan, attachSocketIOBridge } from "shokupan";
import { Server } from "socket.io";

const app = new Shokupan();

// Define your controllers
@WebsocketController()
class ChatController {
    @Event('join')
    handleJoin(ctx, data) {
        ctx.emit('welcome', { message: 'Hello!' });
    }
}

app.mount('/chat', ChatController);

// Start server
const server = await app.listen(3000);
const nodeServer = (server as any).nodeServer;

if (nodeServer) {
    const io = new Server(nodeServer, {
        cors: { origin: "*" }
    });
    
    // Bridge Socket.IO to Shokupan
    attachSocketIOBridge(io, app);
}
```

### Client-Side (Socket.IO)

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

socket.on('connect', () => {
    // Emit events - they'll be routed to @Event handlers
    socket.emit('join', { roomId: 1 });
});

socket.on('welcome', (data) => {
    console.log(data.message); // 'Hello!'
});
```

### How It Works

The `attachSocketIOBridge` utility:
1. Listens for Socket.IO client connections
2. Routes Socket.IO events to your `@Event` handlers
3. Makes `ctx.socket` available as the Socket.IO socket instance
4. Provides `ctx.io` for accessing the Socket.IO server

---

## HTTP Bridge (Experimental)

The HTTP Bridge allows you to call your existing HTTP endpoints through a WebSocket connection, reducing connection overhead for API-heavy applications.

### Why Use HTTP Bridge?

- **Single Connection**: Maintain one WebSocket for both real-time events and API calls
- **Reduced Latency**: No TCP handshake overhead for each request
- **Simplified Client**: One connection type to manage
- **Firewall Friendly**: Works in environments that restrict HTTP connections

### Enabling the Bridge

```typescript
const app = new Shokupan({
    enableHttpBridge: true
});
```

### Protocol Specification

**Request Format:**

```typescript
{
    type: "HTTP",
    id: string | number,     // Unique request ID for matching responses
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
    path: string,            // e.g. "/api/users/123"
    headers?: Record<string, string>,
    body?: any               // Request body (will be JSON stringified)
}
```

**Response Format:**

```typescript
{
    type: "RESPONSE",
    id: string | number,     // Matches request ID
    status: number,          // HTTP status code
    headers: Record<string, string>,
    body: any                // Response body
}
```

### Client Example (Native WebSocket)

```typescript
class WebSocketHTTPClient {
    private ws: WebSocket;
    private pendingRequests = new Map<string, (response: any) => void>();
    private requestId = 0;

    constructor(url: string) {
        this.ws = new WebSocket(url);
        this.ws.onmessage = this.handleMessage.bind(this);
    }

    async request(method: string, path: string, body?: any) {
        const id = `req-${this.requestId++}`;
        
        return new Promise((resolve) => {
            this.pendingRequests.set(id, resolve);
            
            this.ws.send(JSON.stringify({
                type: 'HTTP',
                id,
                method,
                path,
                headers: { 'Content-Type': 'application/json' },
                body
            }));
        });
    }

    private handleMessage(event: MessageEvent) {
        const message = JSON.parse(event.data);
        
        if (message.type === 'RESPONSE') {
            const callback = this.pendingRequests.get(message.id);
            if (callback) {
                callback(message);
                this.pendingRequests.delete(message.id);
            }
        }
    }

    // Convenience methods
    get(path: string) {
        return this.request('GET', path);
    }

    post(path: string, body: any) {
        return this.request('POST', path, body);
    }

    put(path: string, body: any) {
        return this.request('PUT', path, body);
    }

    delete(path: string) {
        return this.request('DELETE', path);
    }
}

// Usage
const client = new WebSocketHTTPClient('ws://localhost:3000');

const response = await client.post('/api/users', {
    name: 'Alice',
    email: 'alice@example.com'
});

console.log(response.status); // 201
console.log(response.body);   // { id: 123, name: 'Alice', ... }
```

### Full Example

```typescript
// Server
const app = new Shokupan({
    enableHttpBridge: true
});

// Regular HTTP endpoints
app.post('/api/users', async (ctx) => {
    const data = await ctx.body();
    const user = await createUser(data);
    return ctx.json(user, 201);
});

app.get('/api/users/:id', async (ctx) => {
    const user = await getUser(ctx.params.id);
    return ctx.json(user);
});

// WebSocket events
@WebsocketController()
class NotificationController {
    @Event('subscribe')
    handleSubscribe(ctx, data) {
        ctx.socket.subscribe(`user:${data.userId}`);
    }
}

app.mount('/ws', NotificationController);
app.listen(3000);

// Client
const client = new WebSocketHTTPClient('ws://localhost:3000/ws');

// Make HTTP calls over WebSocket
const user = await client.post('/api/users', {
    name: 'Bob'
});

// Also handle real-time events
client.ws.send(JSON.stringify({
    event: 'subscribe',
    data: { userId: user.body.id }
}));
```

---

## Best Practices

### 1. Choose the Right Pattern

- **Controllers**: Complex applications with many events and lifecycle needs
- **Routers**: Simple APIs, microservices, or when you prefer functional style
- **Inline**: Quick prototypes, simple echo servers, or minimal WebSocket needs

### 2. State Management

Always initialize state in `@OnOpen()` or `onOpen()`:

```typescript
@OnOpen()
handleOpen(ctx, ws) {
    // Return value is automatically set to ctx.state and ws.data
    return {
        userId: ctx.query.userId,
        connectedAt: Date.now(),
        subscriptions: new Set()
    };
}
```

### 3. Error Handling

Always implement error handlers:

```typescript
@OnError()
handleError(ctx, ws, error) {
    console.error('WebSocket error:', error);
    ctx.emit('error', { message: 'An error occurred' });
}
```

### 4. Graceful Cleanup

Clean up resources in `@OnClose()`:

```typescript
@OnClose()
handleClose(ctx, ws, code, reason) {
    // Unsubscribe from all channels
    ctx.state.subscriptions?.forEach(channel => {
        ws.unsubscribe(channel);
    });
    
    // Clean up database connections, timers, etc.
}
```

### 5. Security

- Validate all upgrade requests in `@OnUpgrade()`
- Sanitize and validate all event data
- Use rate limiting in `@OnEvent()` middleware
- Never trust client-provided data

```typescript
@OnUpgrade()
handleUpgrade(ctx) {
    const token = ctx.query.token;
    if (!isValidToken(token)) {
        return false;
    }
    return true;
}

@OnEvent()
handleEvent(ctx, ws, eventName, data) {
    // Rate limiting
    if (isRateLimited(ctx.state.userId)) {
        return false;
    }
    
    // Input validation
    if (!isValidEventData(eventName, data)) {
        ctx.emit('error', { message: 'Invalid data' });
        return false;
    }
}
```

---

## Complete Real-World Example

Here's a complete chat application demonstrating all WebSocket features:

```typescript
import { Shokupan, WebsocketController, OnUpgrade, OnOpen, OnEvent, Event, OnClose } from 'shokupan';

interface ChatState {
    userId: string;
    username: string;
    currentRoom: string | null;
}

@WebsocketController()
class ChatController {
    @OnUpgrade()
    handleUpgrade(ctx) {
        const token = ctx.query.token;
        if (!token) {
            return false;
        }
        return true;
    }

    @OnOpen()
    handleOpen(ctx, ws): ChatState {
        const userId = getUserIdFromToken(ctx.query.token);
        const username = getUsernameFromToken(ctx.query.token);
        
        console.log(`${username} connected`);
        
        return {
            userId,
            username,
            currentRoom: null
        };
    }

    @OnEvent()
    handleEvent(ctx, ws, eventName, data) {
        // Log all events
        console.log(`[${ctx.state.username}] ${eventName}`, data);
        
        // Rate limiting
        if (isRateLimited(ctx.state.userId)) {
            ctx.emit('error', { message: 'Too many requests' });
            return false;
        }
        
        return true;
    }

    @Event('room.join')
    handleJoinRoom(ctx, data) {
        const { room } = data;
        
        // Leave current room
        if (ctx.state.currentRoom) {
            ctx.socket.unsubscribe(ctx.state.currentRoom);
            ctx.socket.publish(ctx.state.currentRoom, JSON.stringify({
                event: 'user.left',
                data: { username: ctx.state.username }
            }));
        }
        
        // Join new room
        ctx.socket.subscribe(room);
        ctx.state.currentRoom = room;
        
        // Notify room
        ctx.socket.publish(room, JSON.stringify({
            event: 'user.joined',
            data: { username: ctx.state.username }
        }));
        
        ctx.emit('room.joined', { room });
    }

    @Event('message.send')
    handleMessage(ctx, data) {
        if (!ctx.state.currentRoom) {
            ctx.emit('error', { message: 'Not in a room' });
            return;
        }
        
        const message = {
            id: generateId(),
            username: ctx.state.username,
            text: data.text,
            timestamp: Date.now()
        };
        
        // Publish to room
        ctx.socket.publish(ctx.state.currentRoom, JSON.stringify({
            event: 'message.new',
            data: message
        }));
    }

    @Event('typing.start')
    handleTypingStart(ctx) {
        if (ctx.state.currentRoom) {
            ctx.socket.publish(ctx.state.currentRoom, JSON.stringify({
                event: 'user.typing',
                data: { username: ctx.state.username }
            }));
        }
    }

    @OnClose()
    handleClose(ctx, ws) {
        console.log(`${ctx.state.username} disconnected`);
        
        // Leave current room
        if (ctx.state.currentRoom) {
            ctx.socket.publish(ctx.state.currentRoom, JSON.stringify({
                event: 'user.left',
                data: { username: ctx.state.username }
            }));
        }
    }
}

const app = new Shokupan();
app.mount('/chat', ChatController);
app.listen(3000);
```

---

## Summary

Shokupan's WebSocket support provides:

- **Three flexible patterns**: Controllers, Routers, and Inline handlers
- **Nested router mounting**: Share a single connection across multiple routers/controllers
- **Full lifecycle control**: Upgrade, open, message, event, close, and error hooks
- **Type-safe and performant**: Built on Bun's native WebSocket implementation
- **Event-based architecture**: Structured event routing with decorators
- **Binary format support**: No strict payload format - use JSON, protobuf, msgpack, or any format
- **Middleware integration**: HTTP middleware applies to WebSocket upgrade requests
- **Production-ready features**: Authentication, rate limiting, pub/sub, and more

Choose the pattern that fits your needs and build real-time applications with confidence!

## Additional Resources

- [Nested WebSocket Routers Guide](../guides/websocket-nested-routers.md)
- [WebSocket Controller API Reference](../api/functions/WebsocketController.md)
- [Example: Nested Routers](https://github.com/knackstedt/shokupan/blob/main/examples/websocket-nested-routers.ts)
