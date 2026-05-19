# Sample 10: Microservices

Demonstrates microservice architecture with internal HTTP sub-requests using `internalRequest()`.

## Features

- Multiple Shokupan services running simultaneously
- Internal sub-requests via `internalRequest()`
- Gateway service that aggregates data from other services
- No network overhead for internal communication

## Run

```bash
bun main.ts
```

## Services

- **User Service** — `http://localhost:3010`
- **Order Service** — `http://localhost:3011`
- **Gateway** — `http://localhost:3012`

## Endpoints

### User Service (3010)
- `GET /health`
- `GET /users`
- `GET /users/:id`

### Order Service (3011)
- `GET /health`
- `GET /orders`
- `GET /orders/:id`

### Gateway (3012)
- `GET /health`
- `GET /dashboard` — Aggregated metrics
- `GET /users/:id/orders` — User + their orders

## Test

```bash
# Gateway dashboard
curl http://localhost:3012/dashboard

# User with orders (gateway aggregates via internalRequest)
curl http://localhost:3012/users/1/orders
```
