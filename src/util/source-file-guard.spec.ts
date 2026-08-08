import { describe, expect, test } from 'bun:test';
import { isSourceViewEnabled, resolveSourceFile } from './source-file-guard';

describe('source-file-guard: isSourceViewEnabled', () => {
    test('returns false when explicitly disabled', () => {
        expect(isSourceViewEnabled(true)).toBe(false);
    });

    test('returns false in production regardless of opt-out flag', () => {
        const prev = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        try {
            expect(isSourceViewEnabled(undefined)).toBe(false);
            expect(isSourceViewEnabled(false)).toBe(false);
        } finally {
            process.env.NODE_ENV = prev;
        }
    });

    test('returns true when not disabled and not production', () => {
        const prev = process.env.NODE_ENV;
        process.env.NODE_ENV = 'development';
        try {
            expect(isSourceViewEnabled(undefined)).toBe(true);
            expect(isSourceViewEnabled(false)).toBe(true);
        } finally {
            process.env.NODE_ENV = prev;
        }
    });
});

describe('source-file-guard: resolveSourceFile', () => {
    const cwd = process.cwd();

    test('rejects missing / non-string file parameter', () => {
        expect(resolveSourceFile(undefined).ok).toBe(false);
        expect(resolveSourceFile('').ok).toBe(false);
        expect(resolveSourceFile(123 as any).ok).toBe(false);
        expect(resolveSourceFile(undefined).status).toBe(400);
    });

    test('rejects path traversal outside project root', () => {
        const result = resolveSourceFile('../package.json');
        expect(result.ok).toBe(false);
        expect(result.status).toBe(403);
    });

    test('rejects path traversal via cwd-prefix collision', () => {
        // e.g. cwd=/home/foo, attacker tries /home/foobar/bar.txt via ../foobar/bar.txt
        const lastDir = cwd.split('/').pop();
        const result = resolveSourceFile(`../${lastDir}foo/bar.txt`);
        expect(result.ok).toBe(false);
        expect(result.status).toBe(403);
    });

    test('accepts a regular file inside the project root', () => {
        const result = resolveSourceFile('package.json');
        expect(result.ok).toBe(true);
        expect(result.path).toBe(`${cwd}/package.json`);
    });

    test('blocks .env files at the project root', () => {
        for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
            const result = resolveSourceFile(name);
            expect(result.ok).toBe(false);
            expect(result.status).toBe(403);
        }
    });

    test('blocks .env files nested under subdirectories', () => {
        const result = resolveSourceFile('apps/web/.env');
        expect(result.ok).toBe(false);
        expect(result.status).toBe(403);
    });

    test('blocks TLS private keys and certificates', () => {
        for (const name of ['server.pem', 'tls/key.pem', 'cert.key', 'server.p12', 'keystore.jks']) {
            const result = resolveSourceFile(name);
            expect(result.ok).toBe(false);
            expect(result.status).toBe(403);
        }
    });

    test('blocks SSH private keys by basename', () => {
        for (const name of ['id_rsa', 'id_ed25519', 'config/id_ecdsa']) {
            const result = resolveSourceFile(name);
            expect(result.ok).toBe(false);
            expect(result.status).toBe(403);
        }
    });

    test('blocks common credential dotfiles', () => {
        for (const name of ['.npmrc', '.netrc', '.htpasswd', 'credentials.json']) {
            const result = resolveSourceFile(name);
            expect(result.ok).toBe(false);
            expect(result.status).toBe(403);
        }
    });

    test('allows ordinary source files with similar-looking names', () => {
        for (const name of ['env.ts', 'environment.spec.ts', 'package.json', 'src/keys/index.ts']) {
            const result = resolveSourceFile(name);
            expect(result.ok).toBe(true);
        }
    });
});
