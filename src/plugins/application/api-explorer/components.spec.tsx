
import { describe, expect, it } from 'bun:test';
import { render } from 'preact-render-to-string';
import { ApiExplorerApp } from './components';

describe('ApiExplorer Components XSS', () => {
    it('should escape XSS in path parameters', () => {
        const maliciousPath = '/users/{id<img src=x onerror=alert(1)>}';
        const html = render(<ApiExplorerApp
            spec={{
                info: { title: 'Test' },
                paths: {
                    [maliciousPath]: {
                        get: { tags: ['Test'] }
                    }
                }
            }}
            base="/explorer"
            config={{}}
        />);


        expect(html).toContain('&lt;img src=x onerror=alert(1)>');
    });

    it('should escape XSS in title', () => {
        const maliciousTitle = '<script>alert(1)</script>';
        const html = render(<ApiExplorerApp
            spec={{
                info: { title: maliciousTitle, version: '1.0' },
                paths: {}
            }}
            base="/explorer"
            config={{}}
        />);

        expect(html).toContain('&lt;script>alert(1)&lt;/script>');
    });

    it('should escape XSS in explorer data JSON', () => {
        const maliciousTitle = '</script><script>alert(1)</script>';
        const html = render(<ApiExplorerApp
            spec={{
                info: { title: maliciousTitle, version: '1.0' },
                paths: {}
            }}
            base="/explorer"
            config={{}}
        />);

        // This is injected into <script id="explorer-data">
        // It should rely on safeScriptJson to replace </script>
        expect(html).not.toContain('</script><script>alert(1)</script>');
        expect(html).toContain('<\\/script><script>alert(1)<\\/script>');
    });
});
