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
                    src: 'src/plugins/application/dashboard/template.eta',
                    dest: 'plugins/application/dashboard'
                },
                {
                    src: 'src/plugins/application/dashboard/static/*',
                    dest: 'plugins/application/dashboard/static'
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
        target: 'node18',
    }
});
