---
title: Failed Request Recorder
description: Capture and store details of failed requests.
---

The `FailedRequestRecorder` middleware captures details about requests that result in unhandled exceptions or 500 errors. These records can be used for debugging or replaying requests later.

## Usage

```typescript
import { FailedRequestRecorder } from 'shokupan';

app.use(FailedRequestRecorder());
```

## Integration with Debug Dashboard

The captured failures are viewable in the [Debug Dashboard](/shokupan/plugins/debug-dashboard). You can inspect the error, stack trace, headers, and body, and even replay the request from the dashboard.

## Configuration

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `maxCapacity` | `number` | `10000` | Maximum number of failed requests to store. |
| `ttl` | `number` | `86400000` (24h) | Time to live for stored failures (ms). |
