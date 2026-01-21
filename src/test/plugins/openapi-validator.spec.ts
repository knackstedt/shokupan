import axios from 'axios';
import { describe, expect, it } from 'bun:test';
import getPort from 'get-port';
import { openApiValidator } from '../../plugins/middleware/openapi-validator';
import { Shokupan } from '../../shokupan';

describe('OpenAPI Validator Plugin', () => {

    it('should validate request body against generated spec', async () => {
        const port = await getPort();
        const app = new Shokupan({
            port,
            enableOpenApiGen: false
        });

        app.get('/items', (ctx) => {
            return ctx.json({ id: 1, name: 'Item 1' });
        });

        app.post('/items', (ctx) => {
            return ctx.json({ success: true });
        });

        app.use(openApiValidator());

        app.openApiSpec = {
            paths: {
                '/items': {
                    post: {
                        requestBody: {
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            name: { type: 'string' },
                                            price: { type: 'number', minimum: 0 }
                                        },
                                        required: ['name', 'price']
                                    }
                                }
                            }
                        },
                        responses: {
                            '200': { description: 'OK' }
                        }
                    },
                    get: {
                        parameters: [
                            {
                                name: 'limit',
                                in: 'query',
                                schema: { type: 'integer', minimum: 1 }
                            }
                        ],
                        responses: {
                            '200': { description: 'OK' }
                        }
                    }
                }
            }
        };

        const server = await app.listen();
        const baseUrl = `http://localhost:${port}`;

        try {
            // 1. Valid POST
            await axios.post(`${baseUrl}/items`, { name: 'Test', price: 10 });

            // 2. Invalid POST (Missing price)
            const res2 = await axios.post<any>(`${baseUrl}/items`, { name: 'Test' }, {
                validateStatus: () => true
            });
            expect(res2.status).toBe(400);
            expect(res2.data.errors[0].message).toContain('required property');

            // 3. Invalid POST (Wrong type)
            const res3 = await axios.post<any>(`${baseUrl}/items`, { name: 'Test', price: "expensive" }, {
                validateStatus: () => true
            });
            expect(res3.status).toBe(400);
            expect(res3.data.errors[0].message).toContain('must be number');

            // 4. Valid GET query
            await axios.get(`${baseUrl}/items?limit=5`);

            // 5. Invalid GET query (Wrong type)
            const res5 = await axios.get(`${baseUrl}/items?limit=abc`, {
                validateStatus: () => true
            });
            expect(res5.status).toBe(400);

            // 5b. Invalid GET query (Number constraint)
            const res5b = await axios.get<any>(`${baseUrl}/items?limit=0`, {
                validateStatus: () => true
            });
            expect(res5b.status).toBe(400);
            expect(res5b.data.errors[0].message).toContain('>= 1');

        } finally {
            server.stop();
        }
    });

    it('should validate path parameters', async () => {
        const port = await getPort();
        const app = new Shokupan({ port, enableOpenApiGen: false });

        app.get('/users/:id', (ctx) => ctx.text(`User ${ctx.params['id']}`));
        app.use(openApiValidator());

        app.openApiSpec = {
            paths: {
                '/users/{id}': {
                    get: {
                        parameters: [
                            {
                                name: 'id',
                                in: 'path',
                                schema: { type: 'integer' },
                                required: true
                            }
                        ],
                        responses: { '200': { description: 'OK' } }
                    }
                }
            }
        };

        const server = await app.listen();
        const baseUrl = `http://localhost:${port}`;

        try {
            await axios.get(`${baseUrl}/users/123`);

            const res = await axios.get<any>(`${baseUrl}/users/abc`, {
                validateStatus: () => true
            });
            expect(res.status).toBe(400);
            expect(res.data.errors[0].location).toBe('path');

        } finally {
            server.stop();
        }
    });
});
