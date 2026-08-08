/**
 * Header redaction utilities for the dashboard and error view.
 *
 * The dashboard logs request/response headers to a datastore that may be
 * retrievable via HTTP endpoints. Sensitive headers (Authorization, Cookie,
 * API keys) must be redacted before storage to prevent credential leakage.
 */

/**
 * Headers that are redacted from dashboard logs to prevent credential leakage.
 * Values for these headers are replaced with '[REDACTED]'. The header keys
 * are preserved so the dashboard can show that the header was present.
 */
const SENSITIVE_HEADERS = new Set([
    'authorization',
    'proxy-authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'api-key',
    'x-auth-token',
    'x-secret',
    'x-csrf-token',
]);

/**
 * Copy a headers record with sensitive header values replaced by '[REDACTED]'.
 * Header names are compared case-insensitively.
 */
export function redactHeaders(headers: Record<string, string>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const key of Object.keys(headers)) {
        if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
            result[key] = '[REDACTED]';
        } else {
            result[key] = headers[key];
        }
    }
    return result;
}
