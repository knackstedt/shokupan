/**
 * Security helpers for the debug/source-view HTTP endpoints (e.g.
 * `/_code` and `/explorer/_source`).
 *
 * These endpoints exist to let developers jump from generated API docs to the
 * relevant source file in their editor. Left unrestricted they become an
 * arbitrary-file-read primitive: anything under the process working directory
 * — `.env` files, TLS private keys, third-party API credentials, the full
 * application source — can be fetched by any caller who knows the URL.
 *
 * The helpers here centralise two layers of defence:
 *
 *  1. `isSourceViewEnabled` — gates *registration* of the endpoint so that it
 *     is never mounted in production (or when explicitly disabled), mirroring
 *     the existing `enableSourceView ?? !isProduction` convention used by the
 *     API Explorer.
 *  2. `resolveSourceFile` — resolves a user-supplied path against the project
 *     root, rejects path traversal, and refuses to serve files that commonly
 *     hold secrets even when they live inside the project.
 */

import { resolve, sep } from 'node:path';
import { getProcess, getProcessEnv } from './env';

/** Dotfiles that are treated as sensitive regardless of extension. */
const SENSITIVE_DOTFILES = new Set([
    '.env',
    '.npmrc',
    '.pypirc',
    '.netrc',
    '.htpasswd',
    '.git-credentials',
    '.dockerconfigjson',
]);

/** Basenames (case-insensitive) that are treated as sensitive. */
const SENSITIVE_BASENAMES = new Set([
    'credentials',
    'credentials.json',
    'serviceaccount.json',
    'service-account.json',
    'gcloud-service-key.json',
    'id_rsa',
    'id_dsa',
    'id_ecdsa',
    'id_ed25519',
    'id_ecdsa_sk',
    'id_ed25519_sk',
]);

/** Extensions that indicate private keys / certificates / keystores. */
const SENSITIVE_EXTENSION = /\.(pem|key|p12|pfx|crt|cer|keystore|jks|gpg|kdbx)$/i;

/** Matches `.env` and variants such as `.env.local` or `.env.production.local`. */
const ENV_FILE = /^\.env(\..*)?$/i;

export interface SourceFileResolution {
    ok: boolean;
    /** Absolute path to serve when `ok` is true. */
    path?: string;
    /** HTTP status code to return when `ok` is false. */
    status?: number;
    /** Status text to return when `ok` is false. */
    message?: string;
}

/**
 * Decide whether a source-view endpoint should be registered at all.
 *
 * Source view is a development convenience. It is disabled when the operator
 * explicitly opts out (`disableSourceView === true`) and is off by default in
 * production (`NODE_ENV === 'production'`).
 */
export function isSourceViewEnabled(disabled: boolean | undefined): boolean {
    if (disabled) return false;
    return getProcessEnv('NODE_ENV') !== 'production';
}

/** Return true when `relPath` (relative to the project root) looks like a secret. */
function isSensitiveRelativePath(relPath: string): boolean {
    if (!relPath) return false;

    const parts = relPath.split(sep);
    for (const part of parts) {
        if (!part) continue;
        const lower = part.toLowerCase();

        // Any `.env*` file at any depth is treated as a secret.
        if (ENV_FILE.test(part)) return true;

        // Known secret dotfiles anywhere in the path (e.g. a `~/.aws/credentials`
        // style layout mirrored inside the project).
        if (SENSITIVE_DOTFILES.has(lower)) return true;
    }

    const basename = parts[parts.length - 1] ?? '';
    const lowerBasename = basename.toLowerCase();
    if (SENSITIVE_BASENAMES.has(lowerBasename)) return true;
    if (SENSITIVE_EXTENSION.test(basename)) return true;

    return false;
}

/**
 * Resolve a user-supplied `file` query parameter against the project root and
 * validate that it is safe to serve through a source-view endpoint.
 *
 * Returns `{ ok: true, path }` when the file may be served, otherwise
 * `{ ok: false, status, message }` describing the HTTP response to send.
 */
export function resolveSourceFile(file: unknown): SourceFileResolution {
    if (!file || typeof file !== 'string') {
        return { ok: false, status: 400, message: 'Missing file parameter' };
    }

    const cwd = getProcess()?.cwd() || '';
    if (!cwd) {
        return { ok: false, status: 403, message: 'Forbidden: File must be within project root' };
    }

    const resolvedPath = resolve(cwd, file);

    // Path traversal: the resolved path must be the project root itself or live
    // strictly underneath it. Using `cwd + sep` avoids the prefix-collision bug
    // where `/home/foo` would wrongly match `/home/foobar`.
    if (resolvedPath !== cwd && !resolvedPath.startsWith(cwd + sep)) {
        return { ok: false, status: 403, message: 'Forbidden: File must be within project root' };
    }

    // Defence in depth: even files inside the project root may hold secrets.
    const rel = resolvedPath === cwd ? '' : resolvedPath.slice(cwd.length + sep.length);
    if (isSensitiveRelativePath(rel)) {
        return { ok: false, status: 403, message: 'Forbidden: Refusing to serve sensitive file' };
    }

    return { ok: true, path: resolvedPath };
}
