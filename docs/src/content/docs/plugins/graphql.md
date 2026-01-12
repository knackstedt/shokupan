---
title: GraphQL (Apollo)
description: Create GraphQL APIs using the Apollo Server plugin.
---

The **GraphQL Apollo Plugin** integrates [Apollo Server 4](https://www.apollographql.com/docs/apollo-server/) into Shokupan, allowing you to easily serve GraphQL APIs.

## Installation

You must install `@apollo/server` and `graphql` as dependencies:

```bash
bun add @apollo/server graphql
```

## Usage

Register the plugin with your `typeDefs` and `resolvers`.

```typescript
import { Shokupan, GraphQLApolloPlugin } from 'shokupan';

const app = new Shokupan();

const typeDefs = `#graphql
  type Query {
    hello: String
  }
`;

const resolvers = {
  Query: {
    hello: () => 'world',
  },
};

app.register(new GraphQLPlugin({
    typeDefs,
    resolvers,
    path: '/graphql' // Optional: default is '/graphql'
}));

await app.listen(3000);
```

Visit `http://localhost:3000/graphql` in your browser to access the Apollo Sandbox (Playground).

## Configuration

The `GraphQLPlugin` accepts the following options:

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `typeDefs` | `any` | Required | GraphQL Type Definitions |
| `resolvers` | `any` | Required | GraphQL Resolvers |
| `path` | `string` | `'/graphql'` | URL path to mount the GraphQL endpoint |
| `apolloConfig` | `ApolloServerOptions` | `{}` | Additional configuration passed to `ApolloServer` constructor |

### Accessing Context

The Shokupan [Context](/core/context) is passed to your resolvers throughout the `context` argument. You can access it via the `shokupan` property, or simply merge it if you prefer (the default implementation passes `{ ...ctx, shokupan: ctx }`).

```typescript
const resolvers = {
  Query: {
    currentUser: (parent, args, context) => {
      // Access Shokupan Context
      const ctx = context.shokupan;
      return ctx.state.user;
    },
  },
};
```
