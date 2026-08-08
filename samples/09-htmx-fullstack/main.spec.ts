import { describe, expect, it } from 'bun:test';

describe('Sample 9: HTMX Fullstack', () => {
    it('should import Shokupan', async () => {
        const { Shokupan } = await import('../../src/index');
        expect(Shokupan).toBeDefined();
    }, { timeout: 15000 });

    it('should create an app instance', async () => {
        const { Shokupan } = await import('../../src/index');
        const app = new Shokupan({ port: 0 });
        expect(app).toBeDefined();
    }, { timeout: 15000 });

    it('should HTML-escape todo text in the list partial (stored XSS regression)', async () => {
        const { todoListPartial, todos } = await import('./main');
        const payload = '<img src=x onerror=alert(document.cookie)>';
        todos.push({ id: 9999, text: payload, done: false });
        try {
            const html = todoListPartial();
            // Raw payload must NOT appear verbatim in rendered HTML.
            expect(html).not.toContain(payload);
            // It must be HTML-encoded instead.
            expect(html).toContain('&lt;img src=x onerror=alert(document.cookie)&gt;');
        } finally {
            const idx = todos.findIndex(t => t.id === 9999);
            if (idx !== -1) todos.splice(idx, 1);
        }
    }, { timeout: 15000 });

    it('should HTML-escape todo text returned by POST /todos (stored XSS regression)', async () => {
        const { app, todos } = await import('./main');
        const payload = '<img src=x onerror=alert(document.cookie)>';
        const req = new Request('http://localhost:3009/todos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: payload })
        });
        const res = await app.fetch(req);
        expect(res).toBeDefined();
        expect(res!.status).toBe(200);
        const html = await res!.text();
        // Raw payload must NOT appear verbatim in the response body.
        expect(html).not.toContain(payload);
        // It must be HTML-encoded instead.
        expect(html).toContain('&lt;img src=x onerror=alert(document.cookie)&gt;');
        // Cleanup the stored todo so other tests/sessions are not affected.
        const created = todos.find(t => t.text === payload);
        if (created) {
            const idx = todos.findIndex(t => t.id === created.id);
            if (idx !== -1) todos.splice(idx, 1);
        }
    }, { timeout: 15000 });
});
