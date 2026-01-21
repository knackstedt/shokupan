---
title: MCP Server
description: Expose your Shokupan API as a Model Context Protocol (MCP) server.
---

The MCP Server plugin allows you to expose your Shokupan application's endpoints as tools to Large Language Models (LLMs) via the [Model Context Protocol](https://modelcontextprotocol.io/).

## Features

- **Automatic Tool Registration**: Automatically converts your OpenAPI endpoints (GET, POST, etc.) into MCP tools.
- **Introspection**: Supports MCP introspection for discovering available tools.
- **SSE Transport**: Uses Server-Sent Events (SSE) for communication with MCP clients.
- **Configurable**: Control which tools are exposed and how they behave.

## Installation

The MCP Server plugin is included in the `shokupan` package.

```typescript
import { Shokupan, McpServerPlugin } from 'shokupan';

const app = new Shokupan({
    enableOpenApiGen: true // Required: Tools are generated from OpenAPI spec
});

// Register the MCP server
app.register(new McpServerPlugin({
    path: '/mcp', // Mount path for SSE endpoint
    allowIntrospection: true,
    allowToolExecution: true
}));
```

## Configuration

The `McpServerPlugin` accepts the following options:

interface McpServerPluginOptions {
    /**
     * Path to mount the MCP server (SSE endpoint).
     * @default '/mcp'
     */
    path?: string;

    /**
     * Root directory to scan for OpenAPI documents.
     * @default process.cwd()
     */
    rootDir?: string;

    /**
     * Whether to allow introspection (listing tools).
     * @default true
     */
    allowIntrospection?: boolean;

    /**
     * Whether to allow tool execution.
     * @default true
     */
    allowToolExecution?: boolean;
}
```

## Available Prompts

The server exposes several built-in prompts for LLMs:

- `generate-client`: Generates a TypeScript client for an endpoint.
- `refactor-endpoint`: Suggests refactoring improvements for an endpoint handler.
- `generate-tests`: specific unit tests for an endpoint.

## How It Works

The plugin analyzes your application's generated OpenAPI specification. Each operation (endpoint) in the spec is registered as an MCP tool.

- **Tool Name**: Derived from the operation ID or method + path (e.g., `get_users`).
- **Description**: Taken from the operation summary or description.
- **Arguments**: The tool's input schema is derived from the endpoint's request body and parameters.

When an MCP client (like an LLM agent) calls a tool, the plugin internally routes the request to the corresponding Shokupan handler, executing it as if it were a standard HTTP request.
