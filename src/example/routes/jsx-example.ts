import { ShokupanRouter } from '../../router';
import type { JSXRenderer } from '../../types';

/**
 * JSX Rendering Examples
 * 
 * This demonstrates JSX rendering capabilities in Shokupan.
 * Note: You need to configure a JSX renderer (like Eta, EJS, or a custom one)
 * in your ShokupanConfig or router config.
 * 
 * For this example, we'll use a simple string-based renderer as a demo.
 */

// Simple JSX-like renderer for demonstration
// In production, you'd use Eta, React renderToString, or another JSX engine
const simpleJSXRenderer: JSXRenderer = async (element: any) => {
    // This is a simplified example - real JSX rendering would be more complex
    if (typeof element === 'string') {
        return element;
    }

    if (typeof element === 'function') {
        const result = element();
        return simpleJSXRenderer(result);
    }

    // Handle object-based JSX structure
    if (element && typeof element === 'object') {
        const { type, props } = element;

        if (type === 'html') {
            return `<!DOCTYPE html>\n<html ${renderProps(props)}>${renderChildren(props.children)}</html>`;
        }

        if (typeof type === 'string') {
            const children = renderChildren(props?.children);
            return `<${type} ${renderProps(props)}>${children}</${type}>`;
        }
    }

    return String(element || '');
};

function renderProps(props: any = {}): string {
    return Object.entries(props)
        .filter(([key]) => key !== 'children')
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');
}

function renderChildren(children: any): string {
    if (!children) return '';
    if (Array.isArray(children)) {
        return children.map(child =>
            typeof child === 'string' ? child : simpleJSXRenderer(child)
        ).join('');
    }
    return typeof children === 'string' ? children : '';
}

// JSX component examples (using object notation for demo)
const Layout = (props: { title: string; children: any; }) => ({
    type: 'html',
    props: {
        lang: 'en',
        children: [
            {
                type: 'head',
                props: {
                    children: [
                        `<meta charset="UTF-8">`,
                        `<meta name="viewport" content="width=device-width, initial-scale=1.0">`,
                        `<title>${props.title}</title>`,
                        `<style>
                            body { font-family: system-ui, -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
                            h1 { color: #333; }
                            .card { background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 10px 0; }
                            code { background: #e0e0e0; padding: 2px 6px; border-radius: 3px; }
                            pre { background: #1e1e1e; color: #fff; padding: 15px; border-radius: 5px; overflow-x: auto; }
                            a { color: #0066cc; text-decoration: none; }
                            a:hover { text-decoration: underline; }
                        </style>`
                    ]
                }
            },
            {
                type: 'body',
                props: { children: props.children }
            }
        ]
    }
});

const HomePage = () => ({
    type: Layout,
    props: {
        title: 'JSX Rendering Example - Home',
        children: [
            `<h1>🎨 JSX Rendering in Shokupan</h1>`,
            `<div class="card">`,
            `<p>This page is rendered using JSX-like syntax in Shokupan!</p>`,
            `<p>The <code>ctx.jsx()</code> method allows you to render JSX elements to HTML.</p>`,
            `</div>`,
            `<h2>Available Examples</h2>`,
            `<ul>`,
            `<li><a href="/jsx/about">About Page</a></li>`,
            `<li><a href="/jsx/user/123">User Profile</a></li>`,
            `<li><a href="/jsx/blog/my-first-post">Blog Post</a></li>`,
            `<li><a href="/jsx/dashboard">Dashboard</a></li>`,
            `</ul>`
        ]
    }
});

export class JSXExampleRouter extends ShokupanRouter {
    constructor() {
        super({
            name: 'JSX Rendering Examples',
            group: 'jsx',
            // Configure JSX renderer for this router
            renderer: simpleJSXRenderer
        });

        // Example 1: Simple JSX page
        this.get('/',
            {
                summary: 'JSX Home Page',
                description: 'Renders the home page using JSX',
                tags: ['JSX', 'Rendering']
            },
            async (ctx) => {
                return ctx.jsx(HomePage());
            }
        );

        // Example 2: About page
        this.get('/about',
            {
                summary: 'JSX About Page',
                description: 'Renders an about page using JSX',
                tags: ['JSX', 'Rendering']
            },
            async (ctx) => {
                const aboutPage = Layout({
                    title: 'About - JSX Example',
                    children: [
                        `<h1>About This Example</h1>`,
                        `<div class="card">`,
                        `<p>This demonstrates JSX rendering in Shokupan.</p>`,
                        `<p>JSX allows you to write HTML-like syntax that gets rendered to actual HTML.</p>`,
                        `</div>`,
                        `<h2>Features</h2>`,
                        `<ul>`,
                        `<li>Component-based rendering</li>`,
                        `<li>Reusable layouts</li>`,
                        `<li>Type-safe with TypeScript</li>`,
                        `<li>Async rendering support</li>`,
                        `</ul>`,
                        `<p><a href="/jsx">← Back to Home</a></p>`
                    ]
                });

                return ctx.jsx(aboutPage);
            }
        );

        // Example 3: Dynamic content with parameters
        this.get('/user/:id',
            {
                summary: 'JSX User Profile',
                description: 'Renders a user profile with dynamic content',
                tags: ['JSX', 'Rendering', 'Dynamic']
            },
            async (ctx) => {
                const { id } = ctx.params;

                // Simulate fetching user data
                const userData = {
                    id,
                    name: `User ${id}`,
                    email: `user${id}@example.com`,
                    joinDate: new Date().toLocaleDateString()
                };

                const userPage = Layout({
                    title: `User Profile - ${userData.name}`,
                    children: [
                        `<h1>👤 ${userData.name}</h1>`,
                        `<div class="card">`,
                        `<p><strong>User ID:</strong> ${userData.id}</p>`,
                        `<p><strong>Email:</strong> ${userData.email}</p>`,
                        `<p><strong>Join Date:</strong> ${userData.joinDate}</p>`,
                        `</div>`,
                        `<p><a href="/jsx">← Back to Home</a></p>`
                    ]
                });

                return ctx.jsx(userPage);
            }
        );

        // Example 4: Blog post with slug
        this.get('/blog/:slug',
            {
                summary: 'JSX Blog Post',
                description: 'Renders a blog post using JSX',
                tags: ['JSX', 'Rendering', 'Dynamic']
            },
            async (ctx) => {
                const { slug } = ctx.params;

                const blogPost = Layout({
                    title: slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                    children: [
                        `<h1>📝 ${slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</h1>`,
                        `<div class="card">`,
                        `<p><em>Published on ${new Date().toLocaleDateString()}</em></p>`,
                        `<p>This is a blog post about <strong>${slug}</strong>.</p>`,
                        `<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>`,
                        `</div>`,
                        `<h2>Comments</h2>`,
                        `<div class="card">`,
                        `<p>No comments yet. Be the first to comment!</p>`,
                        `</div>`,
                        `<p><a href="/jsx">← Back to Home</a></p>`
                    ]
                });

                return ctx.jsx(blogPost);
            }
        );

        // Example 5: Dashboard with components
        this.get('/dashboard',
            {
                summary: 'JSX Dashboard',
                description: 'Renders a dashboard with multiple components',
                tags: ['JSX', 'Rendering', 'Components']
            },
            async (ctx) => {
                const stats = [
                    { label: 'Total Users', value: '1,234' },
                    { label: 'Active Sessions', value: '42' },
                    { label: 'Requests Today', value: '15,678' }
                ];

                const dashboard = Layout({
                    title: 'Dashboard',
                    children: [
                        `<h1>📊 Dashboard</h1>`,
                        `<div class="card">`,
                        `<h2>Statistics</h2>`,
                        ...stats.map(stat =>
                            `<p><strong>${stat.label}:</strong> ${stat.value}</p>`
                        ),
                        `</div>`,
                        `<div class="card">`,
                        `<h2>Recent Activity</h2>`,
                        `<ul>`,
                        `<li>User john@example.com logged in</li>`,
                        `<li>New order #1234 created</li>`,
                        `<li>System backup completed</li>`,
                        `</ul>`,
                        `</div>`,
                        `<p><a href="/jsx">← Back to Home</a></p>`
                    ]
                });

                return ctx.jsx(dashboard);
            }
        );

        // Example 6: Form example
        this.get('/contact',
            {
                summary: 'JSX Contact Form',
                description: 'Renders a contact form',
                tags: ['JSX', 'Rendering', 'Forms']
            },
            async (ctx) => {
                const contactPage = Layout({
                    title: 'Contact Us',
                    children: [
                        `<h1>📧 Contact Us</h1>`,
                        `<div class="card">`,
                        `<form method="POST" action="/jsx/contact">`,
                        `<p><label>Name: <input type="text" name="name" required /></label></p>`,
                        `<p><label>Email: <input type="email" name="email" required /></label></p>`,
                        `<p><label>Message: <textarea name="message" rows="5" required></textarea></label></p>`,
                        `<p><button type="submit">Send Message</button></p>`,
                        `</form>`,
                        `</div>`,
                        `<p><a href="/jsx">← Back to Home</a></p>`
                    ]
                });

                return ctx.jsx(contactPage);
            }
        );

        // Example 7: Handle form submission
        this.post('/contact',
            {
                summary: 'Handle Contact Form',
                description: 'Processes contact form submission',
                tags: ['JSX', 'Forms']
            },
            async (ctx) => {
                const formData = await ctx.body();

                const thanksPage = Layout({
                    title: 'Thank You',
                    children: [
                        `<h1>✅ Thank You!</h1>`,
                        `<div class="card">`,
                        `<p>Thanks for your message, <strong>${formData.name || 'there'}</strong>!</p>`,
                        `<p>We'll get back to you at <strong>${formData.email || 'your email'}</strong> as soon as possible.</p>`,
                        `</div>`,
                        `<p><a href="/jsx">← Back to Home</a></p>`
                    ]
                });

                return ctx.jsx(thanksPage);
            }
        );
    }
}
