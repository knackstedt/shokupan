# Sample 5: Auth + Validation

A protected blog API with Zod validation and session-based authentication.

## Features

- `Validation()` middleware with Zod schemas
- `Session()` middleware for stateful auth
- Role-based route protection
- Public vs protected endpoints
- OpenAPI auto-generation

## Run

```bash
bun run dev
```

## Test

```bash
bun test
```

## API Endpoints

### Public

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /health | Health check |
| GET | /posts | List published posts |
| GET | /posts/:id | Get single post |
| POST | /auth/login | Login (body: { username, password }) |
| POST | /auth/logout | Logout |

### Protected

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /posts | Create post (requires login) |
| GET | /admin/posts | List all posts (admin only) |
| DELETE | /admin/posts/:id | Delete post (admin only) |

## Test Credentials

- `admin` / `admin123` (admin role)
- `alice` / `alice123` (user role)
