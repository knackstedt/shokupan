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
