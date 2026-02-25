#!/usr/bin/env bun
/**
 * scripts/start-dev.ts
 *
 * Unified dev launcher:
 *   1. Finds a free port via get-port
 *   2. Spawns `ng serve` in ./client on that port
 *   3. Spawns the Shokupan server with ANGULAR_DEV_PORT in its env
 *
 * Usage:  bun run dev  (or:  bun run scripts/start-dev.ts)
 */
import { spawn } from 'bun';
import getPort from 'get-port';

const ngPort = await getPort({ port: [4200, 4201, 4202, 4300, 4400, 4500] });

console.log(`\n🍞 Shokupan dev launcher`);
console.log(`  Angular dev server → http://localhost:${ngPort}`);
console.log(`  Proxied under      → http://localhost:<SHOKUPAN_PORT>/_app/\n`);

// ── Angular dev server ─────────────────────────────────────────────────────
const ng = spawn({
    cmd: ['ng', 'serve', '--port', String(ngPort), '--no-open', '--configuration', 'development'],
    cwd: new URL('../client', import.meta.url).pathname,
    env: { ...process.env, FORCE_COLOR: '1' },
    stdout: 'inherit',
    stderr: 'inherit',
});

// ── Shokupan server ────────────────────────────────────────────────────────
// IMPORTANT: set ANGULAR_DEV_PORT in the env object passed to spawn(),
// NOT in process.env — child processes inherit env at spawn time.
const serverEnv = { ...process.env, ANGULAR_DEV_PORT: String(ngPort) };

const server = spawn({
    cmd: ['bun', '--watch', 'main.ts'],
    cwd: new URL('../examples/full', import.meta.url).pathname,
    env: serverEnv,
    stdout: 'inherit',
    stderr: 'inherit',
});

// Kill child processes when parent exits
process.on('SIGINT', () => {
    ng.kill();
    server.kill();
    process.exit(0);
});

await Promise.all([ng.exited, server.exited]);
