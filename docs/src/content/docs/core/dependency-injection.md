---
title: Dependency Injection
description: Manage dependencies with Shokupan's built-in DI system.
---

Shokupan provides a powerful, built-in Dependency Injection (DI) system inspired by frameworks like NestJS and Angular. It allows you to manage dependencies efficiently, decouple your code, and easily test your applications.

## Core Concepts

The system revolves around two main decorators:

- **`@Injectable(scope)`**: Marks a class as a **Service** that can be managed by the container.
- **`@Inject(token)`**: Injects a dependency into a class property or constructor parameter.

## Basic Usage

### 1. Define a Service

Mark your class with `@Injectable()`. By default, services are **singletons** (shared across the application).

```typescript
import { Injectable } from 'shokupan';

@Injectable()
export class UserService {
    private users = ['Alice', 'Bob'];

    getAll() {
        return this.users;
    }
}
```

### 2. Inject into a Controller

You can inject services directly into your controllers using **Constructor Injection**.

```typescript
import { Controller, Get, Injectable } from 'shokupan';
import { UserService } from './user.service';

@Controller('/users')
export class UserController {
    
    // Automatically injected based on type!
    constructor(private userService: UserService) {}

    @Get('/')
    getUsers() {
        return this.userService.getAll();
    }
}
```

:::tip
Shokupan automatically resolves dependencies based on TypeScript type metadata. You don't need `@Inject()` unless you are using tokens or interface injection.
:::

## Scopes

You can define the lifecycle of your services using the `scope` parameter in `@Injectable`.

### Singleton (Default)

A single instance is created and reused.

```typescript
@Injectable('singleton') 
// or just @Injectable()
class SharedService { ... }
```

### Instanced (Transient)

A new instance is created **every time** the service is resolved.

```typescript
@Injectable('instanced')
class RequestIdService {
    public id = crypto.randomUUID();
    
    constructor() {
        console.log('New instance created:', this.id);
    }
}
```

## Injection Types

### Constructor Injection (Recommended)

The cleanest way to declare dependencies.

```typescript
@Injectable()
class Consumer {
    constructor(
        private serviceA: ServiceA,
        private serviceB: ServiceB
    ) {}
}
```

### Property Injection

Useful for circular dependencies or optional dependencies.

```typescript
import { Inject, Injectable } from 'shokupan';

@Injectable()
class Consumer {
    @Inject(ServiceA)
    private serviceA!: ServiceA;
}
```

### Parameter Injection (Route Handlers)

You can also inject services directly into route handlers using the `@Use` decorator.

```typescript
import { Get, Use } from 'shokupan';

@Controller('/')
class ApiController {
    @Get('/dynamic')
    handleRequest(@Use(InstancedService) service: InstancedService) {
        return { id: service.id };
    }
}
```

## Lifecycle Hooks

Services can hook into the application lifecycle.

### `onInit()`

Called immediately after the service is instantiated and its dependencies are resolved.

```typescript
@Injectable()
class DatabaseService {
    onInit() {
        console.log('DatabaseService initialized!');
        this.connect();
    }
}
```

### `onDestroy()`

Called on **Singleton** services when the application stops (`app.stop()`). Use this for cleanup (closing connections, stopping timers).

```typescript
@Injectable()
class DatabaseService {
    async onDestroy() {
        console.log('Closing database connection...');
        await this.disconnect();
    }
}
```

## Circular Dependencies

Circular dependencies (A depends on B, B depends on A) in constructors will cause a runtime error:

`Error: Circular dependency detected: ServiceA -> ServiceB -> ServiceA`

To resolve this, use **Property Injection** for at least one side of the cycle.

## Manual Resolution

You can access the `Container` directly if needed, for example in legacy code or testing.

```typescript
import { Container } from 'shokupan/util/di';

const service = Container.resolve(UserService);
```
