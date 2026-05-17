import { describe, expect, test } from "bun:test";
import { Dashboard } from "../../plugins/application/dashboard/plugin";

describe("Security: Dashboard Replay SSRF Protection", () => {
    test("blocks replay to internal addresses", () => {
        const result = Dashboard.validateReplayUrl('http://localhost:8080/secret', '/admin');
        expect(result.error).toContain('internal addresses');
    });

    test("blocks replay with blocked protocol", () => {
        const result = Dashboard.validateReplayUrl('file:///etc/passwd', '/admin');
        expect(result.error).toContain('Invalid protocol');
    });

    test("blocks replay to dashboard path", () => {
        const result = Dashboard.validateReplayUrl('http://example.com/admin/replay', '/admin');
        expect(result.error).toContain('dashboard path');
    });

    test("blocks replay to 172.16.x.x private range", () => {
        const result = Dashboard.validateReplayUrl('http://172.16.0.1/secret', '/admin');
        expect(result.error).toContain('internal addresses');
    });

    test("allows replay to 172.32.x.x public range", () => {
        const result = Dashboard.validateReplayUrl('http://172.32.1.1/api', '/admin');
        expect(result.error).toBeUndefined();
    });

    test("allows replay to external addresses", () => {
        const result = Dashboard.validateReplayUrl('https://api.example.com/users', '/admin');
        expect(result.error).toBeUndefined();
    });

    test("returns error for invalid URL", () => {
        const result = Dashboard.validateReplayUrl('not-a-url', '/admin');
        expect(result.error).toContain('Invalid URL');
    });
});
