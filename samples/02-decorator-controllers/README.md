# Sample 2: Decorator Controllers

A User API built with Shokupan decorator-based controllers and dependency injection.

## Features

- `@Controller` decorator for route prefixing
- `@Get`, `@Post` decorators for HTTP methods
- `@Param`, `@Body` decorators for parameter binding
- `@Injectable` services with constructor injection
- `Container` for DI management

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
| GET | /api/users | List users |
| GET | /api/users/:id | Get user by ID |
| POST | /api/users | Create user |
