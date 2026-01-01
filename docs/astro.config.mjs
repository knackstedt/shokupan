import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
    site: 'https://knackstedt.github.io',
    base: '/shokupan',
    integrations: [
        starlight({
            title: 'Shokupan',
            description: 'A low-lift modern web framework for Bun',
            social: {
                github: 'https://github.com/knackstedt/shokupan',
            },
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
                    ],
                },
                {
                    label: 'Core Concepts',
                    items: [
                        { label: 'Routing', link: '/core/routing/' },
                        { label: 'Controllers', link: '/core/controllers/' },
                        { label: 'Middleware', link: '/core/middleware/' },
                        { label: 'Context', link: '/core/context/' },
                        { label: 'Static Files', link: '/core/static-files/' },
                    ],
                },
                {
                    label: 'Plugins',
                    items: [
                        { label: 'Authentication', link: '/plugins/authentication/' },
                        { label: 'CORS', link: '/plugins/cors/' },
                        { label: 'Compression', link: '/plugins/compression/' },
                        { label: 'Debug Dashboard', link: '/plugins/debug-dashboard/' },
                        { label: 'Failed Request Recorder', link: '/plugins/failed-request-recorder/' },
                        { label: 'Idempotency', link: '/plugins/idempotency/' },
                        { label: 'OpenAPI Validation', link: '/plugins/openapi-validation/' },
                        { label: 'Proxy', link: '/plugins/proxy/' },
                        { label: 'Rate Limiting', link: '/plugins/rate-limiting/' },
                        { label: 'Scalar (OpenAPI)', link: '/plugins/scalar/' },
                        { label: 'Security Headers', link: '/plugins/security-headers/' },
                        { label: 'Sessions', link: '/plugins/sessions/' },
                        { label: 'Validation', link: '/plugins/validation/' },
                    ],
                },
                {
                    label: 'Migration Guides',
                    items: [
                        { label: 'From Express', link: '/migration/from-express/' },
                        { label: 'From Koa', link: '/migration/from-koa/' },
                        { label: 'From NestJS', link: '/migration/from-nestjs/' },
                        { label: 'Express Middleware', link: '/migration/express-middleware/' },
                    ],
                },
                {
                    label: 'Guides',
                    items: [
                        { label: 'Advanced Features', link: '/guides/advanced/' },
                        { label: 'CLI Tools', link: '/guides/cli/' },
                        { label: 'Deployment', link: '/guides/deployment/' },
                        { label: 'Testing', link: '/guides/testing/' },
                    ],
                },
                {
                    label: 'Reference',
                    items: [
                        { label: 'Roadmap', link: '/reference/roadmap/' },
                    ],
                },
            ],
            customCss: [
                './src/styles/custom.css',
            ],
        }),
    ],
});
