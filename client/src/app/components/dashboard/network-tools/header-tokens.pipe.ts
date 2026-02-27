import { Pipe, PipeTransform } from '@angular/core';

export interface HeaderToken {
    /** The key part if the token is `key=value`, otherwise null (standalone directive) */
    key: string | null;
    /** The value part, or the full directive text if no `=` */
    val: string;
    /** Visual separator to render AFTER this token */
    sep: string;
}

/** Headers whose value is semicolon-separated directives (may have key=value or standalone) */
const SEMICOLON_HEADERS = new Set([
    'cookie',
    'set-cookie',
    'content-type',
    'strict-transport-security',
    'content-security-policy',
    'feature-policy',
    'permissions-policy',
    'expect-ct',
]);

/** Headers whose value is comma-separated directives */
const COMMA_HEADERS = new Set([
    'accept',
    'accept-encoding',
    'accept-language',
    'cache-control',
    'allow',
    'transfer-encoding',
    'vary',
    'link',
    'forwarded',
]);

/** Headers with `scheme credential` space-separated format */
const AUTH_HEADERS = new Set([
    'authorization',
    'proxy-authorization',
    'www-authenticate',
]);

@Pipe({ name: 'headerTokens', standalone: true, pure: true })
export class HeaderTokensPipe implements PipeTransform {
    /**
     * @param value  - the raw header value string
     * @param headerName - the header name (used to pick parsing strategy)
     * @returns array of tokens, or null if this header should render as plain text
     */
    transform(value: string, headerName: string): HeaderToken[] | null {
        if (!value) return null;
        const k = headerName.toLowerCase().trim();
        const v = value.trim();

        // ── Authorization: Bearer <token>  ────────────────────────────────
        if (AUTH_HEADERS.has(k)) {
            const idx = v.indexOf(' ');
            if (idx === -1) return null;
            return [
                { key: null, val: v.substring(0, idx), sep: ' ' },
                { key: null, val: v.substring(idx + 1), sep: '' },
            ];
        }

        let sep: string | null = null;
        if (SEMICOLON_HEADERS.has(k)) sep = ';';
        else if (COMMA_HEADERS.has(k)) sep = ',';

        if (!sep) return null;

        const parts = v.split(sep).map(p => p.trim()).filter(Boolean);
        // Only worth rendering as tokens if there are multiple parts
        if (parts.length <= 1) return null;

        return parts.map((part, i): HeaderToken => {
            const eqIdx = part.indexOf('=');
            const isLast = i === parts.length - 1;
            const separator = isLast ? '' : (sep + ' ');

            if (eqIdx === -1) {
                // Standalone directive, e.g. `HttpOnly`, `no-store`, `includeSubDomains`
                return { key: null, val: part, sep: separator };
            }
            return {
                key: part.substring(0, eqIdx).trim(),
                val: part.substring(eqIdx + 1).trim(),
                sep: separator,
            };
        });
    }
}
