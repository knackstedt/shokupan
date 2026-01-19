
import { describe, expect, it } from 'bun:test';
import { ScalarPlugin } from '../../plugins/application/scalar';
import { Shokupan } from '../../shokupan';

describe('Scalar Plugin Warning Fix', () => {
    it('should name scalar plugin "Scalar" not "Scalar.Ts"', async () => {
        const app = new Shokupan();

        // Mount Scalar Plugin
        const plugin = new ScalarPlugin();
        app.register(plugin);

        // Generate Spec
        const spec = await app.generateApiSpec();

        // Find a scalar route
        const route = spec.paths['/reference/openapi.json'];

        expect(route).toBeDefined();
        expect(route.get).toBeDefined();

        // Verify builtin tagging
        expect(route.get['x-shokupan-builtin']).toBe(true);
        expect(route.get['x-shokupan-plugin-name']).toBe('Scalar');

        // Verify tag (which drives the group name sidebar)
        const tags = route.get.tags;
        expect(tags).toBeDefined();
        expect(tags).toContain('Scalar');
        expect(tags).not.toContain('Scalar.Ts');
    });
});
