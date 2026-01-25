import { describe, expect, it, jest } from "bun:test";
import { MemoryStore, Session as session } from '../../plugins/middleware/session';
import { Shokupan } from '../../shokupan';

describe("Session Middleware", () => {
    it("should create a session and persist data", async () => {
        const app = new Shokupan({ port: 0 });

        app.use(session({
            secret: 'secret',
            resave: false,
            saveUninitialized: true
        }));

        app.get('/set', (ctx) => {
            ctx.session['user'] = "test-user";
            return "set";
        });

        app.get('/get', (ctx) => {
            return { user: ctx.session['user'] };
        });

        const server = await app.listen();
        const baseUrl = `http://localhost:${server.port}`;

        // 1. Set session
        const res1 = await fetch(`${baseUrl}/set`);
        expect(res1.status).toBe(200);

        const cookie = res1.headers.get("set-cookie");
        expect(cookie).toBeTruthy();
        expect(cookie).toContain("connect.sid=");

        // 2. Get session
        const res2 = await fetch(`${baseUrl}/get`, {
            headers: {
                "Cookie": cookie!
            }
        });
        const data = await res2.json();
        expect(data).toEqual({ user: "test-user" });

        server.stop();
    });

    it("should reload session data", async () => {
        const app = new Shokupan({ port: 0 });
        app.use(session({ secret: 'secret', resave: false, saveUninitialized: true }));

        app.get('/count', (ctx) => {
            ctx.session['count'] = (ctx.session['count'] || 0) + 1;
            return { count: ctx.session['count'] };
        });

        const server = await app.listen();
        const baseUrl = `http://localhost:${server.port}`;

        let cookie: string;

        // Request 1
        {
            const res = await fetch(`${baseUrl}/count`);
            cookie = res.headers.get("set-cookie")!;
            const data = await res.json();
            expect(data['count']).toBe(1);
        }

        // Request 2
        {
            const res = await fetch(`${baseUrl}/count`, { headers: { "Cookie": cookie } });
            const data = await res.json();
            expect(data['count']).toBe(2);
        }

        server.stop();
    });



    it("should respect cookie options (signed, maxAge)", async () => {
        const app = new Shokupan({ port: 0 });
        app.use(session({
            secret: 'mysecret',
            cookie: { maxAge: 10000, httpOnly: true, secure: true },
            resave: false,
            saveUninitialized: true
        }));

        app.get('/', (ctx) => "ok");

        const server = await app.listen();
        const res = await fetch(`http://localhost:${server.port}/`);
        const cookie = res.headers.get("set-cookie")!;

        // Should be signed (s:...)
        expect(cookie).toContain("connect.sid=s%3A");
        // Should have Max-Age
        expect(cookie).toContain("Max-Age");
        expect(cookie).toContain("HttpOnly");
        expect(cookie).toContain("Secure");

        server.stop();
    });

    it("should use custom store", async () => {
        const app = new Shokupan({ port: 0 });

        const mockStore = new MemoryStore();
        const spyGet = jest.spyOn(mockStore, 'get');
        const spySet = jest.spyOn(mockStore, 'set');

        app.use(session({
            secret: 'secret',
            store: mockStore,
            resave: false,
            saveUninitialized: true
        }));

        app.get('/', (ctx) => {
            ctx.session['touched'] = true;
            return "ok";
        });

        const server = await app.listen();
        const res = await fetch(`http://localhost:${server.port}/`);
        const cookie = res.headers.get("set-cookie")!;

        expect(spySet).toHaveBeenCalled();

        await fetch(`http://localhost:${server.port}/`, { headers: { "Cookie": cookie } });

        expect(spyGet).toHaveBeenCalled();

        server.stop();
    });

    it("should not save if unmodified and resave=false", async () => {
        const app = new Shokupan({ port: 0 });
        const mockStore = new MemoryStore();
        const spySet = jest.spyOn(mockStore, 'set');

        app.use(session({
            secret: 'secret',
            store: mockStore,
            resave: false,
            saveUninitialized: false // Don't save empty
        }));

        app.get('/', (ctx) => "ok");

        const server = await app.listen();
        // 1. Request - empty session, not modified, saveUninitialized=false -> NO SET
        const res1 = await fetch(`http://localhost:${server.port}/`);
        expect(res1.headers.get("set-cookie")).toBeFalsy();
        expect(spySet).not.toHaveBeenCalled();

        server.stop();
    });

    it("should regenerate session (promise)", async () => {
        const app = new Shokupan({ port: 0 });
        app.use(session({ secret: 'secret', resave: false, saveUninitialized: true }));

        app.get('/login', async (ctx) => {
            await ctx.session.regenerate();
            ctx.session['user'] = "logged-in";
            return "ok";
        });

        app.get('/me', (ctx) => {
            return { id: ctx.session['id'], user: ctx.session['user'] };
        });

        const server = await app.listen();
        const baseUrl = `http://localhost:${server.port}`;

        const res1 = await fetch(`${baseUrl}/me`);
        const cookie1 = res1.headers.get("set-cookie")!;
        const data1 = await res1.json() as any;

        const res2 = await fetch(`${baseUrl}/login`, { headers: { "Cookie": cookie1 } });
        const cookie2 = res2.headers.get("set-cookie")!;

        expect(cookie1).not.toBe(cookie2);

        const res3 = await fetch(`${baseUrl}/me`, { headers: { "Cookie": cookie2 } });
        const data3 = await res3.json() as any;

        expect(data3.id).not.toBe(data1.id);
        expect(data3.user).toBe("logged-in");

        server.stop();
    });

    it("should destroy session (promise)", async () => {
        const app = new Shokupan({ port: 0 });
        app.use(session({ secret: 'secret', resave: false, saveUninitialized: true }));

        app.get('/set', (ctx) => {
            ctx.session['val'] = 1;
            return "ok";
        });

        app.get('/destroy', async (ctx) => {
            await ctx.session.destroy();
            return "destroyed";
        });

        app.get('/check', (ctx) => {
            return { val: ctx.session['val'] };
        });

        const server = await app.listen();
        const baseUrl = `http://localhost:${server.port}`;

        const res1 = await fetch(`${baseUrl}/set`);
        const cookie = res1.headers.get("set-cookie")!;

        await fetch(`${baseUrl}/destroy`, { headers: { "Cookie": cookie } });

        const resChecker = await fetch(`${baseUrl}/check`, { headers: { "Cookie": cookie } });
        expect((await resChecker.json() as any).val).toBeUndefined();

        server.stop();
    });

    it("should reload session (promise)", async () => {
        const app = new Shokupan({ port: 0 });
        const store = new MemoryStore();
        app.use(session({ secret: 'secret', store, resave: false, saveUninitialized: true }));

        app.get('/', (ctx) => {
            return "ok";
        });

        app.get('/update-backend', async (ctx) => {
            return new Promise((resolve) => {
                store.get(ctx.sessionID, (err, sess) => { // MemoryStore.get
                    if (sess) {
                        sess['external'] = 'changed';
                        store.set(ctx.sessionID, sess, () => resolve("updated"));
                    } else {
                        resolve("session-not-found");
                    }
                });
            });
        });

        app.get('/reload', async (ctx) => {
            await ctx.session.reload();
            return { external: ctx.session['external'] };
        });

        const server = await app.listen();
        const baseUrl = `http://localhost:${server.port}`;

        // 1. Start session
        const res1 = await fetch(`${baseUrl}/`);
        const cookie = res1.headers.get("set-cookie")!;

        // 2. Update backend directly
        const updateRes = await fetch(`${baseUrl}/update-backend`, { headers: { "Cookie": cookie } });
        expect(await updateRes.text()).toBe("updated");

        // 3. Reload
        const res3 = await fetch(`${baseUrl}/reload`, { headers: { "Cookie": cookie } });
        const data = await res3.json() as any;
        expect(data.external).toBe("changed");

        server.stop();
    });

    it("should save session (promise)", async () => {
        const app = new Shokupan({ port: 0 });
        const store = new MemoryStore();
        const spySet = jest.spyOn(store, 'set');

        app.use(session({ secret: 'secret', store, resave: false, saveUninitialized: true }));

        app.get('/save', async (ctx) => {
            ctx.session['manually_saved'] = true;
            await ctx.session.save();
            return "saved";
        });

        const server = await app.listen();
        const baseUrl = `http://localhost:${server.port}`;

        await fetch(`${baseUrl}/save`);
        expect(spySet).toHaveBeenCalled();

        server.stop();
    });
});
