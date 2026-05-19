# Sample 7: GraphQL API

Demonstrates GraphQL server integration using GraphQL Yoga plugin.

## Features

- GraphQL schema with queries and mutations
- GraphQL Yoga plugin integration
- In-memory data store

## Run

```bash
bun main.ts
```

## Endpoints

- `GET /health` — Health check
- `POST /graphql` — GraphQL endpoint

## Test Queries

```bash
# List all books
curl -X POST http://localhost:3007/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ books { id title author publishedYear } }"}'

# Get a single book
curl -X POST http://localhost:3007/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ book(id: \"1\") { title author } }"}'

# Add a book
curl -X POST http://localhost:3007/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "mutation { addBook(title: \"New Book\", author: \"Author\", publishedYear: 2024) { id title } }"}'
```
