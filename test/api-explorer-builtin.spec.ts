
import { describe, expect, it } from 'bun:test';
import { ApiExplorerPlugin } from '../src/plugins/application/api-explorer/plugin';
import { Shokupan } from '../src/shokupan';

describe('ApiExplorer Builtin Plugin Support', () => {
    it('should tag api-explorer routes as builtin', async () => {
        const app = new Shokupan();

        // Mount Api Explorer Plugin
        const plugin = new ApiExplorerPlugin();
        app.register(plugin);

        // Generate Spec
        const spec = await app.generateApiSpec();

        console.log('Available paths:', Object.keys(spec.paths));

        // Find an api-explorer route
        // Note: The plugin mounts at default path, let's see what it is.
        const openApiPath = '/explorer/openapi.json';
        const route = spec.paths[openApiPath] || spec.paths['/apiexplorer/openapi.json'];

        expect(route).toBeDefined();
        expect(route.get).toBeDefined();

        // Verify builtin tagging
        expect(route.get['x-shokupan-builtin']).toBe(true);
        expect(route.get['x-shokupan-plugin-name']).toBe('api-explorer');
    });
});
