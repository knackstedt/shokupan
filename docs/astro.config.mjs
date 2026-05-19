import sitemap from '@astrojs/sitemap';
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import starlightImageZoom from 'starlight-image-zoom';
import starlightLlmsTxt from 'starlight-llms-txt';
import starlightThemeFlexoki from 'starlight-theme-flexoki';
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc';

// https://astro.build/config
export default defineConfig({
    site: 'https://shokupan.dev',
    base: '/',
    integrations: [
        sitemap({
            customPages: [
                'https://shokupan.dev/llms.txt',
                'https://shokupan.dev/llms-full.txt',
                'https://shokupan.dev/llms-small.txt',
            ],
            changefreq: 'weekly',
            priority: 0.7,
            lastmod: new Date()
        }),
        starlight({
            components: {
                SocialIcons: './src/components/SocialIcons.astro',
            },
            plugins: [
                starlightImageZoom({ showCaptions: true }),
                starlightThemeFlexoki(),
                starlightLlmsTxt({
                    projectName: 'Shokupan',
                    description: 'A low-lift modern web framework for Bun and Node',
                    promote: ['index*', 'getting-started/**', 'core/**'],
                    demote: ['api/**'],
                    exclude: ['api/**'],
                    customSets: [
                        {
                            label: 'Guides',
                            description: 'Conceptual docs for routing, middleware, plugins, and migration',
                            paths: ['getting-started/**', 'core/**', 'plugins/**', 'migration/**'],
                        },
                        {
                            label: 'API Reference',
                            description: 'Full TypeDoc API reference',
                            paths: ['api/**'],
                        },
                        {
                            label: 'Architecture',
                            description: 'System architecture and design principles',
                            paths: ['core/**', 'performance/**'],
                        },
                    ]
                }),
                starlightTypeDoc({
                    typeDoc: {
                        interfacePropertiesFormat: 'htmlTable',
                    },
                    entryPoints: ['../src/index.ts'],
                    tsconfig: '../tsconfig.json'
                }),
            ],
            title: 'Shokupan',
            description: 'A low-lift modern web framework for Bun',
            social: [
                { label: 'GitHub', href: 'https://github.com/knackstedt/shokupan', icon: 'github' },
            ],
            editLink: {
                baseUrl: 'https://github.com/knackstedt/shokupan/edit/main/docs/',
            },
            sidebar: [
                {
                    label: 'Getting Started',
                    items: [
                        { label: 'Introduction', link: '/' },
                        { label: 'Installation', link: '/getting-started/installation/' },
                        { label: 'Quick Start', link: '/getting-started/quick-start/' },
                        { label: 'Configuration', link: '/getting-started/configuration/' },
                        { label: 'Releases', link: '/releases' },
                    ],
                },
                {
                    label: 'Core Concepts',
                    items: [
                        { label: 'Routing', link: '/core/routing/' },
                        { label: 'Controllers', link: '/core/controllers/' },
                        { label: 'Middleware', link: '/core/middleware/' },
                        { label: 'Dependency Injection', link: '/core/dependency-injection/' },
                        { label: 'Context', link: '/core/context/' },
                        { label: 'Static Files', link: '/core/static-files/' },
                        { label: 'WebSockets', link: '/core/websockets/' },
                    ],
                },
                {
                    label: 'Performance',
                    items: [
                        { label: 'Benchmarks', link: '/performance/benchmarks/' },
                    ],
                },
                {
                    label: 'Plugins',
                    items: [
                        { label: 'Dashboard', link: '/plugins/dashboard/' },
                        { label: 'API Explorer', link: '/plugins/api-explorer/' },
                        { label: 'WS Explorer', link: '/plugins/asyncapi/' },
                        { label: 'Authentication', link: '/plugins/authentication/' },
                        { label: 'Compression', link: '/plugins/compression/' },
                        { label: 'CORS', link: '/plugins/cors/' },
                        { label: 'GraphQL', link: '/plugins/graphql/' },
                        { label: 'Idempotency', link: '/plugins/idempotency/' },
                        { label: 'MCP Server', link: '/plugins/mcp-server/' },
                        { label: 'NodeJS/Deno', link: '/plugins/http-server/' },
                        { label: 'OpenAPI Validation', link: '/plugins/openapi-validation/' },
                        { label: 'Permissions', link: '/plugins/permissions/' },
                        { label: 'Proxy', link: '/plugins/proxy/' },
                        { label: 'Rate Limiting', link: '/plugins/rate-limiting/' },
                        { label: 'Resilience', link: '/plugins/resilience/' },
                        { label: 'Scalar (OpenAPI)', link: '/plugins/scalar/' },
                        { label: 'Security Headers', link: '/plugins/security-headers/' },
                        { label: 'Socket.IO', link: '/plugins/socket-io/' },
                        { label: 'Sessions', link: '/plugins/sessions/' },
                        { label: 'Validation', link: '/plugins/validation/' },
                        { label: 'Vite', link: '/plugins/vite/' },
                    ],
                },
                {
                    label: 'Migration Guides',
                    items: [
                        { label: 'Guides', link: '/migration/' },
                        { label: 'From Express', link: '/migration/from-express/' },
                        { label: 'From Koa', link: '/migration/from-koa/' },
                        { label: 'From NestJS', link: '/migration/from-nestjs/' },
                        { label: 'From Hono', link: '/migration/from-hono/' },
                        { label: 'From Fastify', link: '/migration/from-fastify/' },
                        { label: 'Express Middleware', link: '/migration/express-middleware/' },
                    ],
                },
                {
                    label: 'Guides',
                    items: [
                        { label: 'Advanced Features', link: '/guides/advanced/' },
                        { label: 'AST Generation', link: '/guides/ast-generation/' },
                        { label: 'Debugging', link: '/guides/debugging/' },
                        { label: 'CLI Tools', link: '/guides/cli/' },
                        { label: 'Deployment', link: '/guides/deployment/' },
                        { label: 'Error Handling', link: '/guides/error-handling/' },
                        { label: 'Example Applications', link: '/guides/examples/' },
                        { label: 'Global Type Augmentation', link: '/guides/global-type-augmentation/' },
                        { label: 'JSON Parser Configuration', link: '/guides/json-parser-configuration/' },
                        { label: 'Multipart Streaming', link: '/guides/multipart-streaming/' },
                        { label: 'Plugin Dependencies', link: '/guides/plugin-dependencies/' },
                        { label: 'Production Best Practices', link: '/guides/production/' },
                        { label: 'Testing', link: '/guides/testing/' },
                    ],
                },
                {
                    label: 'Reference',
                    items: [
                        { label: 'Roadmap', link: '/reference/roadmap/' },
                    ],
                },
                typeDocSidebarGroup
            ],
            customCss: [
                './src/styles/custom.css',
            ],
        }),
    ],
    vite: {
        resolve: {
            preserveSymlinks: true,
        },
        server: {
            fs: {
                allow: ['..'],
            }
        }
    }
});
