# Sample 9: HTMX Fullstack

Demonstrates a server-rendered interactive app using HTMX for partial page updates without JavaScript.

## Features

- Server-side HTML rendering
- HTMX attributes for interactive behavior
- Todo CRUD with inline toggling and deletion
- No client-side JavaScript required

## Run

```bash
bun main.ts
```

Then open `http://localhost:3009` in your browser.

## Endpoints

- `GET /` — Full HTML page with HTMX todo app
- `GET /todos/partial` — Todo list partial (for HTMX swaps)
- `POST /todos` — Create todo
- `POST /todos/:id/toggle` — Toggle todo completion
- `DELETE /todos/:id` — Delete todo
- `GET /health` — Health check
