import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
    plugins: [
        dts({
            include: ['src/**/*.ts'],
            exclude: ['src/test/**/*', 'src/example/**/*'],
            tsconfigPath: './tsconfig.json',
            outDir: 'dist',
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
