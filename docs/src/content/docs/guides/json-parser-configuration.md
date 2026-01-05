---
title: JSON Parser Configuration
description: Configure which JSON parser to use for parsing request bodies.
---

## Available Parsers

### 1. Native (`'native'`) - Default
Uses the built-in `JSON.parse` from Bun or Node.js.

**Performance**: ⚡⚡⚡ Fastest (baseline)  
**Error Messages**: Standard  
**Security**: Standard  
**Recommended for**: Production use

```typescript
import { Shokupan } from 'shokupan';

const app = new Shokupan({
    jsonParser: 'native' // This is the default
});
```

### 2. parse-json (`'parse-json'`)
Uses the [`parse-json`](https://www.npmjs.com/package/parse-json) library for enhanced error messages.

**Performance**: ⚡⚡⚡ ~5% slower than native (minimal overhead)  
**Error Messages**: ✨ Excellent - shows context and helpful hints  
**Security**: Standard  
**Recommended for**: Development and debugging

**Installation**:
```bash
bun add parse-json
```

**Usage**:
```typescript
import { Shokupan } from 'shokupan';

const app = new Shokupan({
    jsonParser: 'parse-json'
});

app.post('/api/data', async (ctx) => {
    const body = await ctx.body();
    return ctx.json({ received: body });
});
```

**Benefits**:
- Much better error messages when JSON is malformed
- Shows the position and context of JSON syntax errors
- Minimal performance impact (~5% slower on Bun, competitive with native on Node.js)

### 3. secure-json-parse (`'secure-json-parse'`)
Uses the [`secure-json-parse`](https://www.npmjs.com/package/secure-json-parse) library for protection against prototype pollution attacks.

**Performance**: ⚡⚡ 20-30% slower than native  
**Error Messages**: Standard  
**Security**: 🔒 Protected against prototype pollution  
**Recommended for**: Parsing untrusted user input

**Installation**:
```bash
bun add secure-json-parse
```

**Usage**:
```typescript
import { Shokupan } from 'shokupan';

const app = new Shokupan({
    jsonParser: 'secure-json-parse'
});

app.post('/api/webhook', async (ctx) => {
    // Safe from prototype pollution attacks
    const body = await ctx.body();
    return ctx.json({ processed: true });
});
```

**Benefits**:
- Protects against prototype pollution attacks
- Safely parses JSON from untrusted sources
- Prevents `__proto__`, `constructor`, and `prototype` pollution

**Trade-offs**:
- 20-30% performance penalty compared to native
- Only use when parsing untrusted input

## Performance Comparison

Based on benchmarks with 100,000 iterations:

| Parser | Simple Objects | Nested Objects | Arrays | Large Datasets |
|--------|---------------|----------------|---------|----------------|
| `native` (Bun) | **14.5M ops/sec** | **4.1M ops/sec** | **79.8K ops/sec** | **9.7K ops/sec** |
| `parse-json` (Bun) | 10.4M ops/sec | 2.8M ops/sec | 51K ops/sec | 3.2K ops/sec |
| `secure-json-parse` (Bun) | 8.2M ops/sec | 2.2M ops/sec | 44.5K ops/sec | 2.6K ops/sec |

*Full benchmark results available in [`src/test/json-performance-results.md`](../src/test/json-performance-results.md)*

## Recommendations

### Production Applications
✅ Use `'native'` (default) for best performance

```typescript
const app = new Shokupan({
    jsonParser: 'native' // or omit this line
});
```

### Development/Debugging
✅ Use `'parse-json'` for better error messages with minimal overhead

```typescript
const app = new Shokupan({
    jsonParser: process.env.NODE_ENV === 'development' ? 'parse-json' : 'native'
});
```

### Parsing Untrusted Input
✅ Use `'secure-json-parse'` for webhooks or user-generated content

```typescript
// Main app uses native parser
const app = new Shokupan({
    jsonParser: 'native'
});

// Separate router for untrusted webhooks
const webhookRouter = new ShokupanRouter({
    jsonParser: 'secure-json-parse'
});

webhookRouter.post('/webhook', async (ctx) => {
    const payload = await ctx.body(); // Safely parsed
    return ctx.json({ ok: true });
});

app.mount('/external', webhookRouter);
```

## Error Handling

### Native Parser
```typescript
// Standard JSON error
{
  "error": "Unexpected token 'i', \"invalid\" is not valid JSON"
}
```

### parse-json Parser
```typescript
// Enhanced error with context
{
  "error": "Unexpected token i in JSON at position 1 while parsing '{invalid}'\n\n  > 1 | {invalid}\n  |     ^"
}
```

## Migration Guide

### From Native to parse-json
No code changes needed - just update config:

```diff
const app = new Shokupan({
+   jsonParser: 'parse-json'
});
```

### From Native to secure-json-parse
No code changes needed - just update config:

```diff
const app = new Shokupan({
+   jsonParser: 'secure-json-parse'
});
```

## Notes

- If a parser library is not installed, Shokupan will automatically fall back to native `JSON.parse` with a warning
- The parser configuration applies to all JSON body parsing in the application
- Both `parse-json` and `secure-json-parse` are optional peer dependencies
- Performance impact is most noticeable on high-throughput APIs processing large payloads

## See Also

- [JSON Performance Benchmarks](../src/test/json-performance-results.md)
- [parse-json on npm](https://www.npmjs.com/package/parse-json)
- [secure-json-parse on npm](https://www.npmjs.com/package/secure-json-parse)
