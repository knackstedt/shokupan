import { Shokupan, GraphQLYogaPlugin } from 'shokupan';

/**
 * Sample 7: GraphQL API with Yoga
 *
 * Demonstrates GraphQL server integration using GraphQL Yoga plugin.
 */

const app = new Shokupan({ port: 3007 });

interface Book {
    id: string;
    title: string;
    author: string;
    publishedYear: number;
}

const books: Book[] = [
    { id: '1', title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', publishedYear: 1925 },
    { id: '2', title: '1984', author: 'George Orwell', publishedYear: 1949 },
    { id: '3', title: 'To Kill a Mockingbird', author: 'Harper Lee', publishedYear: 1960 }
];

// Health check
app.get('/health', () => ({ status: 'ok', service: 'graphql-api' }));

// GraphQL Yoga plugin
app.register(new GraphQLYogaPlugin({
    path: '/graphql',
    yogaConfig: {
        schema: {
            typeDefs: /* GraphQL */ `
                type Book {
                    id: ID!
                    title: String!
                    author: String!
                    publishedYear: Int!
                }

                type Query {
                    books: [Book!]!
                    book(id: ID!): Book
                }

                type Mutation {
                    addBook(title: String!, author: String!, publishedYear: Int!): Book!
                }
            `,
            resolvers: {
                Query: {
                    books: () => books,
                    book: (_: any, { id }: { id: string }) =>
                        books.find(b => b.id === id)
                },
                Mutation: {
                    addBook: (_: any, args: Omit<Book, 'id'>) => {
                        const book: Book = {
                            id: String(books.length + 1),
                            ...args
                        };
                        books.push(book);
                        return book;
                    }
                }
            }
        }
    }
}));

await app.listen();
console.log('GraphQL API running on http://localhost:3007');
console.log('GraphQL endpoint: http://localhost:3007/graphql');
console.log('Health check:     GET /health');
