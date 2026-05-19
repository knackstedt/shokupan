# Sample 6: File Upload

Demonstrates multipart form upload handling, file streaming, and serving uploaded files.

## Features

- Multipart form data upload
- File listing
- File download with proper headers
- File streaming for large files

## Run

```bash
bun main.ts
```

## Endpoints

- `GET /health` — Health check
- `POST /upload` — Upload files (multipart form)
- `GET /files` — List uploaded files
- `GET /files/:name` — Download a file
- `GET /stream/:name` — Stream a file

## Test Upload

```bash
curl -F "file=@README.md" http://localhost:3006/upload
curl http://localhost:3006/files
curl -O http://localhost:3006/files/README.md
```
