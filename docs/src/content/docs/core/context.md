---
title: Context
description: Understanding the ShokupanContext API
---

The `ShokupanContext` object provides a rich API for handling requests and responses. It's passed to every route handler and middleware function.

## Context Properties

### Request Information

```typescript
app.get('/info', (ctx) => {
    return {
        // HTTP method
        method: ctx.method,  // 'GET', 'POST', etc.
        
        // Request path
        path: ctx.path,      // '/info'
        
        // Full URL
        url: ctx.url,        // 'http://localhost:3000/info?q=test'
        
        // Path parameters
        params: ctx.params,  // { id: '123' } from /users/:id
        
        // Query parameters (URLSearchParams)
        query: ctx.query,    // URLSearchParams object
        
        // Headers (Headers object)
        headers: ctx.headers,
        
        // Client IP address (string)
        ip: ctx.ip,
        
        // Host (string)
        host: ctx.host, // localhost:3000
        
        // Hostname (string)
        hostname: ctx.hostname, // localhost
        
        // Protocol (string)
        protocol: ctx.protocol, // http
        
        // Secure context (boolean)
        secure: ctx.secure, // false
        
        // Origin (string)
        origin: ctx.origin // http://localhost:3000
    };
});
```

### Request Object

Access the raw Request object:

```typescript
app.post('/upload', async (ctx) => {
    // Raw Request object
    const request = ctx.req;
    
    // Use Request methods
    const formData = await request.formData();
    const blob = await request.blob();
    
    return { uploaded: true };
});
```

### State

Share data across middleware and handlers:

```typescript
app.use(async (ctx, next) => {
    ctx.state.requestId = crypto.randomUUID();
    ctx.state.startTime = Date.now();
    return next();
});

app.get('/', (ctx) => {
    return {
        requestId: ctx.state.requestId,
        duration: Date.now() - ctx.state.startTime
    };
});
```

## Reading Request Data

### Query Parameters

```typescript
app.get('/search', (ctx) => {
    // Get single value
    const q = ctx.query.get('q');
    
    // Get with default
    const page = ctx.query.get('page') || '1';
    
    // Get all values for a key
    const tags = ctx.query.getAll('tag');
    
    // Check if exists
    const hasFilter = ctx.query.has('filter');
    
    return { q, page, tags, hasFilter };
});

// GET /search?q=test&page=2&tag=news&tag=tech
```

### Path Parameters

```typescript
app.get('/users/:userId/posts/:postId', (ctx) => {
    const { userId, postId } = ctx.params;
    
    return {
        user: userId,
        post: postId
    };
});

// GET /users/123/posts/456
// params = { userId: '123', postId: '456' }
```

### Request Body

The `body()` method automatically parses JSON and form data:

```typescript
app.post('/users', async (ctx) => {
    // Auto-parsed based on Content-Type
    const data = await ctx.body();
    
    return { created: data };
});
```

For specific formats:

```typescript
app.post('/data', async (ctx) => {
    // JSON
    const json = await ctx.req.json();
    
    // Text
    const text = await ctx.req.text();
    
    // Form data
    const form = await ctx.req.formData();
    
    // Binary
    const blob = await ctx.req.blob();
    const buffer = await ctx.req.arrayBuffer();
    
    return { received: true };
});
```

### Headers

```typescript
app.get('/headers', (ctx) => {
    // Get single header
    const auth = ctx.headers.get('authorization');
    const userAgent = ctx.headers.get('user-agent');
    
    // Check if exists
    const hasAuth = ctx.headers.has('authorization');
    
    // Get all headers
    const allHeaders = Object.fromEntries(ctx.headers.entries());
    
    return { auth, userAgent, hasAuth, allHeaders };
});
```

### Cookies

```typescript
app.get('/cookies', (ctx) => {
    const cookieHeader = ctx.headers.get('cookie');
    
    // Parse cookies manually or use a plugin
    const cookies = Object.fromEntries(
        cookieHeader?.split(';').map(c => {
            const [key, val] = c.trim().split('=');
            return [key, val];
        }) || []
    );
    
    return { cookies };
});
```

## Sending Responses

### JSON Response

```typescript
app.get('/json', (ctx) => {
    // Implicit JSON (most common)
    return { message: 'Hello' };
    
    // Explicit JSON with status
    return ctx.json({ message: 'Created' }, 201);
    
    // Add headers
    ctx.set('X-Custom', 'value');
    return ctx.json({ data: 'value' });
});
```

### Text Response

```typescript
app.get('/text', (ctx) => {
    return ctx.text('Hello, World!');
    
    // With status
    return ctx.text('Not Found', 404);
});
```

### HTML Response

### JSX Response

Render JSX elements directly:

```typescript
app.get('/jsx', (ctx) => {
    return ctx.jsx(<div>Hello, World!</div>);
    
    // With props
    return ctx.jsx(<MyComponent name="Alice" />);
});
```

To use JSX, ensure you have configured a JSX renderer in your `ShokupanConfig` (if not using the default) or are using a transpiler that supports it.

### File Response

```typescript
app.get('/download', (ctx) => {
    return ctx.file('./path/to/file.pdf', {
        type: 'application/pdf'
    });
});
```

### Redirect

```typescript
app.get('/old', (ctx) => {
    return ctx.redirect('/new');
    
    // Permanent redirect
    return ctx.redirect('/new', 301);
    
    // Temporary redirect (default)
    return ctx.redirect('/new', 302);
});
```

### Status Code

```typescript
app.delete('/users/:id', (ctx) => {
    // No content
    return ctx.status(204);
    
    // Or with send
    return ctx.send(null, { status: 204 });
});
```

### Custom Response

Return a Response object directly:

```typescript
app.get('/custom', (ctx) => {
    return new Response('Custom response', {
        status: 200,
        headers: {
            'Content-Type': 'text/plain',
            'X-Custom-Header': 'value'
        }
    });
});
```

## Response Headers

### Set Headers

```typescript
app.get('/headers', (ctx) => {
    // Set single header
    ctx.set('X-Custom-Header', 'value');
    
    // Set multiple headers
    ctx.set('X-Version', '1.0');
    ctx.set('X-Powered-By', 'Shokupan');
    
    return { message: 'Check headers' };
});
```

### Set Cookies

```typescript
app.get('/set-cookie', (ctx) => {
    ctx.setCookie('sessionId', 'abc123', {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 3600,  // 1 hour
        path: '/',
        domain: 'example.com'
    });
    
    return { message: 'Cookie set' };
});
```

## Streaming Responses

Shokupan provides powerful streaming capabilities for efficient data transfer, real-time updates, and Server-Sent Events (SSE).

### Generic Streaming (`ctx.stream()`)

Stream binary or text data with full control:

```typescript
app.get('/stream', (ctx) => {
    return ctx.stream(async (stream) => {
        // Write binary data
        await stream.write(new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]));
        
        // Write string data (auto-encoded to UTF-8)
        await stream.write("Hello World");
        
        // Sleep for delayed writes
        await stream.sleep(1000);
        
        // Pipe another ReadableStream
        const externalStream = await fetchDataStream();
        await stream.pipe(externalStream);
        
        // Handle client disconnect
        stream.onAbort(() => {
            console.log('Client disconnected');
            cleanup();
        });
    });
});
```

**Error Handling:**

```typescript
app.get('/stream-safe', (ctx) => {
    return ctx.stream(
        async (stream) => {
            await stream.write("Starting...");
            throw new Error("Something went wrong");
        },
        (err, stream) => {
            // Custom error handler
            console.error('Stream error:', err);
            // Optionally write error message
        }
    );
});
```

### Text Streaming (`ctx.streamText()`)

Optimized for text streaming with proper headers:

```typescript
app.get('/logs', (ctx) => {
    return ctx.streamText(async (stream) => {
        // Write without newline
        await stream.write("Log: ");
        
        // Write with newline
        await stream.writeln("Application started");
        await stream.writeln("Loading modules...");
        
        // Delayed output
        await stream.sleep(1000);
        await stream.writeln("Ready!");
    });
});
```

**Automatically sets:**
- `Content-Type: text/plain; charset=utf-8`
- `Transfer-Encoding: chunked`
- `X-Content-Type-Options: nosniff`

**Real-time Log Streaming:**

```typescript
app.get('/tail-logs', (ctx) => {
    return ctx.streamText(async (stream) => {
        const logWatcher = watchLogFile('./app.log');
        
        stream.onAbort(() => {
            logWatcher.close();
        });
        
        for await (const line of logWatcher) {
            await stream.writeln(line);
        }
    });
});
```

### Server-Sent Events (`ctx.streamSSE()`)

Perfect for real-time updates and live data:

```typescript
app.get('/events', (ctx) => {
    return ctx.streamSSE(async (stream) => {
        let id = 0;
        
        while (true) {
            await stream.writeSSE({
                event: 'time-update',
                id: String(id++),
                data: new Date().toISOString(),
                retry: 5000  // Reconnect after 5s
            });
            
            await stream.sleep(1000);
        }
    });
});
```

**Automatically sets:**
- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`

**Live Updates Example:**

```typescript
app.get('/stock-prices', (ctx) => {
    return ctx.streamSSE(async (stream) => {
        const subscription = subscribeToStockUpdates();
        
        stream.onAbort(() => {
            subscription.unsubscribe();
        });
        
        for await (const update of subscription) {
            await stream.writeSSE({
                event: 'price-update',
                data: JSON.stringify({
                    symbol: update.symbol,
                    price: update.price,
                    change: update.change
                }),
                id: update.id
            });
        }
    });
});
```

**Client-side (Browser):**

```javascript
const eventSource = new EventSource('/stock-prices');

eventSource.addEventListener('price-update', (event) => {
    const data = JSON.parse(event.data);
    console.log(`${data.symbol}: $${data.price}`);
});

eventSource.onerror = () => {
    console.error('Connection lost, reconnecting...');
};
```

### Piping Streams (`ctx.pipe()`)

Pipe external ReadableStreams directly:

```typescript
app.get('/video/:id', async (ctx) => {
    const videoId = ctx.params.id;
    const videoStream = await getVideoStream(videoId);
    
    return ctx.pipe(videoStream, {
        status: 200,
        headers: {
            'Content-Type': 'video/mp4',
            'Accept-Ranges': 'bytes'
        }
    });
});
```

**Proxy Example:**

```typescript
app.get('/proxy/:url', async (ctx) => {
    const targetUrl = decodeURIComponent(ctx.params.url);
    const response = await fetch(targetUrl);
    
    return ctx.pipe(response.body!, {
        headers: {
            'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream'
        }
    });
});
```

### AI/LLM Streaming

Stream AI responses in real-time:

```typescript
app.post('/ai/chat', async (ctx) => {
    const { message } = await ctx.body();
    
    return ctx.streamText(async (stream) => {
        const aiStream = await callOpenAI(message);
        
        for await (const chunk of aiStream) {
            await stream.write(chunk.content);
        }
    });
});
```

### Performance Tips

1. **Use appropriate method:**
   - `ctx.stream()` for binary data or custom headers
   - `ctx.streamText()` for text/logs
   - `ctx.streamSSE()` for real-time events
   - `ctx.pipe()` for external streams

2. **Handle cleanup:**
   ```typescript
   stream.onAbort(() => {
       // Close connections
       // Release resources
       // Stop background tasks
   });
   ```

3. **Error handling:**
   ```typescript
   return ctx.streamText(
       async (stream) => { /* ... */ },
       (err, stream) => {
           console.error('Stream error:', err);
       }
   );
   ```

4. **Backpressure:**
   Streams automatically handle backpressure - no manual management needed!


## Advanced Features

### Client IP

```typescript
app.get('/ip', (ctx) => {
    return { ip: ctx.ip };
});
```

### Response Builder

Access the response builder:

```typescript
app.get('/response', (ctx) => {
    const response = ctx.response;
    
    // Build custom response
    response.headers.set('X-Custom', 'value');
    response.status = 201;
    
    return { data: 'value' };
});
```

### Session (with Session Plugin)

```typescript
import { Session } from 'shokupan';

app.use(Session({ secret: 'secret' }));

app.get('/login', (ctx) => {
    ctx.session.user = { id: '123', name: 'Alice' };
    return { message: 'Logged in' };
});

app.get('/profile', (ctx) => {
    if (!ctx.session.user) {
        return ctx.json({ error: 'Not authenticated' }, 401);
    }
    return ctx.session.user;
});
```

## Type Safety

Add types to your context:

```typescript
import { ShokupanContext } from 'shokupan';

interface User {
    id: string;
    name: string;
}

interface MyContext {
    user?: User;
}

app.get('/typed', (ctx: ShokupanContext<MyContext>) => {
    // ctx.state.user is typed as User | undefined
    return { user: ctx.state.user };
});
```

## Next Steps

- [Routing](/core/routing/) - Learn about routing patterns
- [Middleware](/core/middleware/) - Create custom middleware
- [API Reference](../api/interfaces/SessionContext.md) - Complete Context API reference
