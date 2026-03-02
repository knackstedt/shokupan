# TypeScript Type Assertion Support

## Current Status: Not Available for Runtime Analysis

TypeScript type assertions (e.g., `as { name: string }`) are **compile-time only** and are completely stripped from the JavaScript output. This means they cannot be detected by runtime analysis.

## Why It Doesn't Work

When you write:
```typescript
const body = await ctx.body() as { name: string; age: number; };
```

At runtime (even with Bun running TypeScript directly), this becomes:
```javascript
const body = await ctx.body();
```

The `as { name: string; age: number }` part is **completely removed** because it's TypeScript syntax that doesn't exist in JavaScript.

## Alternative Solutions

### Option 1: Use Explicit OpenAPI Specs (Recommended)

```typescript
app.post('/users',
    {
        requestBody: {
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            age: { type: 'number' }
                        },
                        required: ['name', 'age']
                    }
                }
            }
        }
    },
    async (ctx) => {
        const body = await ctx.body() as { name: string; age: number; };
        return ctx.json({ created: true, user: body });
    }
);
```

### Option 2: Use the Static Analyzer

The CLI analyzer (`shokupan analyze`) can parse TypeScript source files and extract type information:

```bash
shokupan analyze src/ --output openapi.json
```

This performs **static AST analysis** and can detect type assertions from the source code.

### Option 3: Future Enhancement - Source Map Parsing

A potential future enhancement could parse TypeScript source maps to recover type information at runtime. This would require:

1. Source maps to be available
2. Source map parser integration
3. Mapping runtime functions back to their TypeScript source

This is complex and not currently implemented.

## What IS Supported

The runtime analyzer successfully detects:

### ✅ Runtime Type Conversions
```typescript
const page = parseInt(ctx.query.page);     // → integer
const price = parseFloat(ctx.query.price); // → float
const active = Boolean(ctx.query.active);  //  → boolean
```

### ✅ Request/Response Patterns
```typescript
await ctx.body();         // → JSON request body (generic)
ctx.json({ ... });        // → JSON response
ctx.html('...');          // → HTML response
ctx.text('...');          // → text response
```

### ❌ TypeScript-Only Features
```typescript
as { ... }                // Type assertions - compile-time only
: Type                    // Type annotations - compile-time only
interface/type            // Type definitions - compile-time only
```

## Recommendation

For precise request body schemas, use explicit OpenAPI spec decorators. The runtime analyzer excels at detecting **runtime behavior** (type conversions, method calls) but cannot access compile-time TypeScript features.

## Infrastructure

The type literal parsing code (`parseTypeLiteral`, `parseTypeString`) has been implemented and is ready for use if/when source map parsing or other mechanisms become available to access TypeScript type information at runtime.
