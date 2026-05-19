---
title: Example Applications
description: Sample applications demonstrating Shokupan features
---

The Shokupan repository includes sample applications that demonstrate real-world usage patterns. These are tested against every beta release.

## Sample Applications

### 1. Basic REST API

A Todo API using functional routing, middleware, and CRUD patterns.

```bash
cd samples/01-basic-rest-api
bun run dev
```

**Features:**
- Functional routing (`app.get`, `app.post`, `app.put`, `app.delete`)
- Request logging middleware
- Path and query parameters
- JSON request/response handling

**Endpoints:**
- `GET /health` — Health check
- `GET /todos` — List todos
- `GET /todos/:id` — Get single todo
- `POST /todos` — Create todo
- `PUT /todos/:id` — Update todo
- `DELETE /todos/:id` — Delete todo

---

### 2. Decorator Controllers

A User API using decorator-based controllers and dependency injection.

```bash
cd samples/02-decorator-controllers
bun run dev
```

**Features:**
- `@Controller`, `@Get`, `@Post` decorators
- `@Param`, `@Body` parameter binding
- `@Injectable` services with constructor injection
- `Container` for DI management

**Endpoints:**
- `GET /api/users` — List users
- `GET /api/users/:id` — Get user by ID
- `POST /api/users` — Create user

---

### 3. WebSocket Real-time App

A chat application using `ShokupanWebsocketRouter`.

```bash
cd samples/03-websocket-realtime
bun run dev
```

**Features:**
- Event-based WebSocket handling
- Named events with typed payloads
- Message history (in-memory)
- AsyncAPI generation

**Events:**
- `chat.join` — Welcome message
- `chat.message` — Send/receive messages
- `chat.history` — Request message history
- `ping` / `pong` — Keep-alive

---

### 4. Fullstack Vite Integration

A backend API with Vite frontend integration.

```bash
cd samples/04-fullstack-vite
bun run dev
```

**Features:**
- Shokupan API backend
- `VitePlugin` for dev server integration
- SPA fallback support
- Single-port fullstack development

**Endpoints:**
- `GET /api/health` — Health check
- `GET /api/items` — List items
- `GET /api/items/:id` — Get item by ID

---

### 5. Auth + Validation

A protected blog API with Zod validation and session-based auth.

```bash
cd samples/05-auth-validation
bun run dev
```

**Features:**
- `validate()` middleware with Zod schemas
- `Session()` middleware for stateful auth
- Role-based route protection
- Public vs protected endpoints

**Test Credentials:**
- `admin` / `admin123` (admin role)
- `alice` / `alice123` (user role)

---

### 6. File Upload

Multipart form upload handling with file streaming and download.

```bash
cd samples/06-file-upload
bun run dev
```

**Features:**
- Multipart form data upload
- File listing and download
- File streaming for large files

**Endpoints:**
- `POST /upload` — Upload files
- `GET /files` — List uploaded files
- `GET /files/:name` — Download a file
- `GET /stream/:name` — Stream a file

---

### 7. GraphQL API

GraphQL server using the GraphQL Yoga plugin.

```bash
cd samples/07-graphql-api
bun run dev
```

**Features:**
- GraphQL schema with queries and mutations
- GraphQL Yoga plugin integration
- In-memory data store

**Endpoints:**
- `POST /graphql` — GraphQL endpoint

---

### 8. Server-Sent Events

Real-time event streaming with SSE.

```bash
cd samples/08-server-sent-events
bun run dev
```

**Features:**
- SSE stream with `ctx.streamSSE()`
- Automatic event ID tracking
- JSON event history endpoint

**Endpoints:**
- `GET /events` — SSE stream
- `GET /events/history` — Recent events
- `POST /events` — Create manual event

---

### 9. HTMX Fullstack

Server-rendered interactive app with HTMX partial updates.

```bash
cd samples/09-htmx-fullstack
bun run dev
```

**Features:**
- Server-side HTML rendering
- HTMX attributes for interactivity
- Todo CRUD without client-side JavaScript

**Endpoints:**
- `GET /` — Full HTML page
- `GET /todos/partial` — Todo list partial
- `POST /todos` — Create todo
- `POST /todos/:id/toggle` — Toggle completion
- `DELETE /todos/:id` — Delete todo

---

### 10. Microservices

Multiple services with internal sub-requests via `internalRequest()`.

```bash
cd samples/10-microservices
bun run dev
```

**Features:**
- Multiple Shokupan services
- Internal HTTP sub-requests
- Gateway aggregation pattern

**Services:**
- User Service — `http://localhost:3010`
- Order Service — `http://localhost:3011`
- Gateway — `http://localhost:3012`

## Running Tests

Each sample includes tests that verify it compiles and the core imports work:

```bash
cd samples/01-basic-rest-api
bun test
```

## Using Samples as Templates

Each sample is a self-contained Bun project. To use one as a starting point:

```bash
cp -r samples/01-basic-rest-api my-project
cd my-project
# Update package.json dependencies from 'link:shokupan' to '^1.0.0'
bun install
```

## Next Steps

- [Quick Start](/getting-started/quick-start/) — Build your first Shokupan app
- [Routing](/core/routing/) — Learn routing patterns
- [Controllers](/core/controllers/) — Use decorator-based controllers
