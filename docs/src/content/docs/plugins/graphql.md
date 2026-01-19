---
title: GraphQL
description: Create GraphQL APIs using Apollo Server or GraphQL Yoga.
---

Shokupan provides first-class support for GraphQL through two powerful plugins: **Apollo Server** and **GraphQL Yoga**. Choose the one that best fits your needs.

## Apollo Server

The **GraphQL Apollo Plugin** integrates [Apollo Server 4](https://www.apollographql.com/docs/apollo-server/) into Shokupan.

### Installation

```bash
bun add @apollo/server graphql
```

### Usage

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

app.register(new GraphQLApolloPlugin({
    typeDefs,
    resolvers,
    path: '/graphql' // Optional
}));

await app.listen(3000);
```

### Configuration (Apollo)

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `typeDefs` | `any` | Required | GraphQL Type Definitions |
| `resolvers` | `any` | Required | GraphQL Resolvers |
| `path` | `string` | `'/graphql'` | URL path to mount the GraphQL endpoint |
| `apolloConfig` | `ApolloServerOptions` | `{}` | Additional configuration passed to `ApolloServer` constructor |

---

## GraphQL Yoga

The **GraphQL Yoga Plugin** integrates [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server), offering a lightweight and feature-rich GraphQL server.

### Installation

```bash
bun add graphql-yoga graphql
```

### Usage

```typescript
import { Shokupan, GraphQLYogaPlugin } from 'shokupan';

const app = new Shokupan();

app.register(new GraphQLYogaPlugin({
    path: '/graphql',
    yogaConfig: {
        schema: {
            typeDefs: /* GraphQL */ `
                type Query {
                    hello: String
                }
            `,
            resolvers: {
                Query: {
                    hello: () => 'Hello from Yoga!',
                },
            },
        },
    }
}));

await app.listen(3000);
```

### Configuration (Yoga)

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `path` | `string` | `'/graphql'` | URL path to mount the GraphQL endpoint |
| `yogaConfig` | `YogaServerOptions` | Required | Configuration passed to `createYoga`. Must include schemas/resolvers. |

## Accessing Context

In both plugins, the Shokupan [Context](/core/context) is passed to your resolvers.

```typescript
// Apollo
const resolvers = {
  Query: {
    currentUser: (parent, args, context) => {
      // Access Shokupan Context
      const ctx = context.shokupan; 
      return ctx.state.user;
    },
  },
};

// Yoga
const resolvers = {
    Query: {
        currentUser: (parent, args, context) => {
            // Context is merged directly
            return context.state.user;
        }
    }
}
```
