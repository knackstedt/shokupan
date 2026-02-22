---
title: AsyncAPI
description: Generate and view AsyncAPI documentation for your WebSocket endpoints.
---

Shokupan provides built-in support for generating AsyncAPI specifications and viewing documentation for your WebSocket and event-driven architectures.

## Features

- **Automatic Generation**: Generates AsyncAPI 2.6 specifications from your `@Event` decorators and WebSocket controllers.
- **Interactive Documentation**: Includes a built-in viewer for your AsyncAPI specs.
- **Source Integration**: View the source code for your message handlers directly in the documentation.

## Installation

The AsyncAPI plugin is included in the `shokupan` package.

```typescript
import { Shokupan, AsyncApiPlugin } from 'shokupan';

const app = new Shokupan({
    enableAsyncApiGen: true // Required: Enable generation
});

// Register the viewer plugin
app.register(new AsyncApiPlugin(), {
    path: '/asyncapi'
});
```

## Configuration

The `AsyncApiPlugin` accepts the following options:

```typescript
interface AsyncApiPluginOptions {
    /**
     * Base path where the documentation will be mounted.
     * Default: '/asyncapi'
     */
    path?: string;

    /**
     * Optional partial AsyncAPI spec to merge with the generated one.
     * Use this to add info, servers, or external docs.
     */
    spec?: any;

    /**
     * Disable the "View Source" feature in the documentation UI.
     * Default: false
     */
    disableSourceView?: boolean;
}
```

## Usage

### Defining Events

Use the `@Event` decorator in your controllers to define WebSocket event handlers. Shokupan will automatically infer the channel and message structure.

```typescript
import { Controller, Event, ShokupanContext } from 'shokupan';
import { Type } from '@sinclair/typebox';

const MessageSchema = Type.Object({
    text: Type.String(),
    userId: Type.String()
});

@Controller('/chat')
export class ChatController {

    @Event('send_message', {
        summary: 'Send a chat message',
        description: 'Sends a message to a specific room',
        message: {
            payload: MessageSchema
        }
    })
    async onMessage(ctx: ShokupanContext) {
        // ... handler code ...
    }
}
```

### Viewing Documentation

Once your application is running, navigate to the configured path (e.g., `http://localhost:3000/asyncapi`) to view your documentation.

### JSON Specification

You can access the raw generated JSON specification at the `/json` subpath (e.g., `http://localhost:3000/asyncapi/json`).

### Pre-compiled Static Specs (AST Export)

Shokupan uses its powerful AST generator to evaluate your WebSocket controllers and `@Event` decorators into dynamic AsyncAPI specifications automatically. 

For massive codebases, AST parsing can slightly impact startup times. You can pre-compile your specification using the Shokupan CLI in a CI Environment. For complete instructions, refer to the **[AST Generation Guide](/guides/ast-generation/)**.
