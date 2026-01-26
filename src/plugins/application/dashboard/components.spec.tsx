
import { describe, expect, it } from 'bun:test';
import { render } from 'preact-render-to-string';
import { DashboardApp } from './components';

describe('Dashboard Components XSS', () => {
    it('should escape XSS in ignorePaths', () => {
        const maliciousPath = '</script><script>alert(1)</script>';
        const html = render(<DashboardApp
            metrics={{ totalRequests: 0, activeRequests: 0, successfulRequests: 0, failedRequests: 0, averageTotalTime_ms: 0 }}
            uptime="0s"
            integrations={{}}
            base="/dashboard"
            getRequestHeadersSource="function() { return {}; }"
            rootPath="/"
            linkPattern=""
            ignorePaths={[maliciousPath]}
        />);

        expect(html).not.toContain(maliciousPath);
        expect(html).toContain('<\\/script><script>alert(1)<\\/script>');
    });

    it('should sanitize getRequestHeadersSource', () => {
        const maliciousSource = 'function() { return "</script><script>alert(1)</script>"; }';
        const html = render(<DashboardApp
            metrics={{ totalRequests: 0, activeRequests: 0, successfulRequests: 0, failedRequests: 0, averageTotalTime_ms: 0 }}
            uptime="0s"
            integrations={{}}
            base="/dashboard"
            getRequestHeadersSource={maliciousSource}
            rootPath="/"
            linkPattern=""
            ignorePaths={[]}
        />);





        // Check for the specific malicious payload being present unescaped
        // The HTML will validly contain </script> for the script tags themselves, so we can't search for just that.
        const maliciousPayload = '"</script><script>alert(1)</script>"';

        expect(html).not.toContain(maliciousPayload);
        // We expect the escaped version
        expect(html).toContain('<\\/script><script>alert(1)<\\/script>');
    });
});
