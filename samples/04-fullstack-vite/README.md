# Sample 4: Fullstack Vite Integration

A fullstack application using Shokupan backend with Vite frontend integration.

## Features

- Shokupan API backend
- `VitePlugin` for seamless Vite dev server integration
- SPA fallback support
- API + frontend on same port

## Run

```bash
bun run dev
```

## Test

```bash
bun test
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/health | Health check |
| GET | /api/items | List items |
| GET | /api/items/:id | Get item by ID |
