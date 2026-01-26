
import { describe, expect, it } from 'bun:test';
import { render } from 'preact-render-to-string';
import { AsyncApiApp } from './components';

describe('AsyncAPI Components XSS', () => {
    it('should escape XSS in server URL', () => {
        const maliciousUrl = 'https://example.com/api"; alert(1); "';
        const html = render(<AsyncApiApp
            spec={{ channels: {} }}
            serverUrl={maliciousUrl}
            base="/asyncapi"
            disableSourceView={false}
            navTree={{}}
        />);

        // window.INITIAL_SERVER_URL = "https://example.com/api\"; alert(1); \"";
        // The quotes are escaped by JSON.stringify (safeScriptJson)
        expect(html).toContain(JSON.stringify(maliciousUrl)); // Should contain the escaped version
        // Should NOT contain: window.INITIAL_SERVER_URL = "https://example.com/api"; alert(1); "";
        // which corresponds to breaking out of the string.

        // Since safeScriptJson uses JSON.stringify, it escapes quotes.
        // We verify that the rendered HTML contains the safeJSON string.
        const safe = JSON.stringify(maliciousUrl);
        expect(html).toContain(`window.INITIAL_SERVER_URL = ${safe};`);
    });

    it('should escape XSS via script tag closing', () => {
        const maliciousSpec = { info: { description: '</script><script>alert("hacked")</script>' } };
        const html = render(<AsyncApiApp
            spec={maliciousSpec}
            serverUrl="http://localhost"
            base="/asyncapi"
            disableSourceView={false}
            navTree={{}}
        />);

        expect(html).not.toContain('</script><script>alert("hacked")</script>');
        // Expect JSON escaped quotes and escaped script tags
        expect(html).toContain('<\\/script><script>alert(\\"hacked\\")<\\/script>');
    });
});
