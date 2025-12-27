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
                        { label: 'CORS', link: '/plugins/cors/' },
                        { label: 'Compression', link: '/plugins/compression/' },
                        { label: 'Rate Limiting', link: '/plugins/rate-limiting/' },
                        { label: 'Security Headers', link: '/plugins/security-headers/' },
                        { label: 'Sessions', link: '/plugins/sessions/' },
                        { label: 'Authentication', link: '/plugins/authentication/' },
                        { label: 'Validation', link: '/plugins/validation/' },
                        { label: 'Scalar (OpenAPI)', link: '/plugins/scalar/' },
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
                        { label: 'Testing', link: '/guides/testing/' },
                        { label: 'Deployment', link: '/guides/deployment/' },
                        { label: 'CLI Tools', link: '/guides/cli/' },
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
