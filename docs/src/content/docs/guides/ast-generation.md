---
title: Pre-compiling AST Generation
description: Pre-compile Shokupan's AST analysis for faster startup and CI deployments.
---

Shokupan powerfully reads your source code during runtime to generate an Abstract Syntax Tree (AST). This allows it to automatically detect your route typings, DTOs, WebSockets events, and dynamically wire them into documentation and dashboard interfaces without you manually writing metadata.

For massive codebases, however, AST parsing and schema generation can impact your application's startup times. To prevent this, you can *pre-compile* your specification using the Shokupan CLI build tools and output it as a static file (e.g. `shokupan-ast.json`) in your project root.

If Shokupan detects a pre-compiled AST file on startup:
1. It automatically disables the runtime AST Analysis worker threads.
2. It mounts the provided static spec directly into its internal registries, optimizing performance immensely.

## Generating the AST via CLI

You can easily dump the analysis from the CLI using the `--ast` flag:

```bash
bunx shokupan generate --ast
```

This will automatically output a `shokupan-ast.json` file in your `process.cwd()`.

### Customizing the Output Path

You can fully customize this filename! Simply configure `astFilePath` in your `ShokupanConfig`:

```typescript
const app = new Shokupan({
    // Tell the runtime generators where to look
    astFilePath: 'custom-ast.json'
});
```

And then generate it explicitly with the CLI using:

```bash
bunx shokupan generate --ast custom-ast.json
```

## Running in a CI/CD Workflow

To generate the artifact within a CI/CD environment (like GitHub Actions), you should run the CLI command before deploying your application container:

```yaml
steps:
  - name: Checkout Code
    uses: actions/checkout@v4

  - name: Setup Node/Bun
    uses: oven-sh/setup-bun@v2

  - name: Install Dependencies
    run: bun install

  - name: Pre-compile Shokupan AST
    run: bunx shokupan generate --ast
    # This generates `shokupan-ast.json` in the project root.
```

Ensure you include the generated `shokupan-ast.json` (or your custom AST file) in your final Docker image or deployment directory. At runtime, Shokupan will automatically detect and utilize the pre-compiled AST, skipping runtime analysis entirely!

## Who Uses the AST?

A number of built-in plugins rely on AST Generation to function seamlessly:
- **[AsyncAPI](/plugins/asyncapi)**: Evaluates the AST to automatically define payload schemas and event structures from `@Event` decorators in your WebSocket controllers.
- **[API Explorer](/plugins/api-explorer)**: Uses the AST to automatically fetch Shokupan's generated OpenAPI specifications, displaying source code mappings directly alongside endpoint definitions.
- **[Scalar (OpenAPI)](/plugins/scalar)**: Leverages the deeply-analyzed OpenAPI specs output by the AST to render beautiful interactive graphical interfaces.
- **[Dashboard](/plugins/dashboard)**: Analyzes the AST tree to build the Application Components registry and graph layouts showing controllers, middleware routing flows, and unparsable code warnings.
