import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
    plugins: [
        dts({
            include: ['src/**/*.ts'],
            exclude: ['src/test/**/*', 'src/example/**/*'],
            tsconfigPath: './tsconfig.json',
            outDir: 'dist',
        }),
        viteStaticCopy({
            targets: [
                {
                    src: 'src/plugins/application/dashboard/static/*',
                    dest: 'plugins/application/dashboard/static'
                },
                {
                    src: 'src/plugins/application/asyncapi/static/*',
                    dest: 'plugins/application/asyncapi/static'
                },
                {
                    src: 'src/plugins/application/api-explorer/static/*',
                    dest: 'plugins/application/api-explorer/static'
                },
                {
                    src: 'src/plugins/application/error-view/assets/*',
                    dest: 'plugins/application/error-view/assets'
                }
            ]
        })
    ],
    build: {
        lib: {
            entry: {
                index: resolve(__dirname, 'src/index.ts'),
                cli: resolve(__dirname, 'src/cli/index.ts')
            },
            formats: ['es', 'cjs']
        },
        rollupOptions: {
            external: (id) => !id.startsWith('.') && !id.startsWith('/'),
        },
        sourcemap: true,
        minify: false,
        target: 'esnext',
    }
});
