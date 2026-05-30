import { Shokupan } from '../src/index';

/**
 * Sample 4: CMS with HTMX
 * Tests: HTML responses, form handling, partial updates
 */

const app = new Shokupan({
    port: 3104,
    development: true,
    enableOpenApiGen: false
});

interface Page {
    id: string;
    slug: string;
    title: string;
    content: string;
    published: boolean;
    updatedAt: string;
}

const pages: Page[] = [
    { id: '1', slug: 'home', title: 'Home', content: '<p>Welcome to our CMS!</p>', published: true, updatedAt: new Date().toISOString() },
    { id: '2', slug: 'about', title: 'About', content: '<p>About us page.</p>', published: true, updatedAt: new Date().toISOString() }
];
let nextId = 3;

const layout = (content: string) => `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>CMS</title><script src="https://unpkg.com/htmx.org@1.9.12"></script></head>
<body><h1>CMS Dashboard</h1>${content}</body></html>`;

// API routes
app.get('/api/health', () => ({ status: 'ok', service: 'cms-htmx' }));

app.get('/api/pages', () => ({ pages: pages.filter(p => p.published) }));

app.get('/api/pages/:slug', (ctx) => {
    const page = pages.find(p => p.slug === ctx.params.slug);
    if (!page) return ctx.json({ error: 'Page not found' }, 404);
    return { page };
});

app.post('/api/pages', async (ctx) => {
    const body = await ctx.body() as { slug?: string; title?: string; content?: string };
    if (!body.slug || !body.title) return ctx.json({ error: 'Slug and title required' }, 400);
    const page: Page = {
        id: String(nextId++), slug: body.slug, title: body.title,
        content: body.content || '', published: true, updatedAt: new Date().toISOString()
    };
    pages.push(page);
    return ctx.json({ page }, 201);
});

app.put('/api/pages/:id', async (ctx) => {
    const page = pages.find(p => p.id === ctx.params.id);
    if (!page) return ctx.json({ error: 'Page not found' }, 404);
    const body = await ctx.body() as Partial<Page>;
    Object.assign(page, body, { updatedAt: new Date().toISOString() });
    return { page };
});

app.delete('/api/pages/:id', (ctx) => {
    const index = pages.findIndex(p => p.id === ctx.params.id);
    if (index === -1) return ctx.json({ error: 'Page not found' }, 404);
    pages.splice(index, 1);
    return { message: 'Page deleted' };
});

// HTMX UI routes
app.get('/', () => {
    const html = layout(`
        <div hx-get="/pages/list" hx-trigger="load"></div>
        <form hx-post="/pages/create" hx-target="#pages-list" hx-swap="beforeend">
            <input name="slug" placeholder="slug" required>
            <input name="title" placeholder="title" required>
            <textarea name="content" placeholder="content"></textarea>
            <button>Create Page</button>
        </form>
    `);
    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
});

app.get('/pages/list', () => {
    const items = pages.map(p => `<li>${p.title} (${p.slug})</li>`).join('');
    const html = `<ul id="pages-list">${items}</ul>`;
    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
});

app.post('/pages/create', async (ctx) => {
    const form = await ctx.request.formData();
    const slug = form.get('slug') as string;
    const title = form.get('title') as string;
    const content = form.get('content') as string;
    if (!slug || !title) return new Response('Slug and title required', { status: 400 });
    const page: Page = {
        id: String(nextId++), slug, title, content: content || '',
        published: true, updatedAt: new Date().toISOString()
    };
    pages.push(page);
    const html = `<li>${page.title} (${page.slug})</li>`;
    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
});

await app.listen();
console.log('CMS HTMX App running on https://localhost:3104');
