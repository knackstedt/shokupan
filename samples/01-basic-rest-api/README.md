# Sample 1: Basic REST API

A simple Todo REST API built with Shokupan functional routing.

## Features

- Functional routing (`app.get`, `app.post`, `app.put`, `app.delete`)
- Middleware for request logging
- Path parameters (`:id`)
- Query parameters (`?completed=true`)
- JSON request/response handling
- Automatic OpenAPI generation

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
| GET | /health | Health check |
| GET | /todos | List all todos |
| GET | /todos/:id | Get single todo |
| POST | /todos | Create todo |
| PUT | /todos/:id | Update todo |
| DELETE | /todos/:id | Delete todo |
