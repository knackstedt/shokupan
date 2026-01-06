import { createHmac, randomUUID } from "crypto";
import { EventEmitter } from "events";
import { ShokupanContext } from "../../context";
import type { Middleware } from "../../util/types";

// --- Types ---

export interface SessionData {
    cookie: Cookie;
    [key: string]: any;
}

export interface SessionCookieOptions {
    /**
     * Maximum age of the session cookie in milliseconds.
     */
    maxAge?: number;
    /**
     * Whether the session cookie should be signed.
     */
    signed?: boolean;
    /**
     * Expiration date of the session cookie.
     */
    expires?: Date;
    /**
     * Whether the session cookie should be HTTP-only.
     */
    httpOnly?: boolean;
    /**
     * Path of the session cookie.
     */
    path?: string;
    /**
     * Domain of the session cookie.
     */
    domain?: string;
    /**
     * Whether the session cookie should be secure.
     */
    secure?: boolean | 'auto';
    /**
     * SameSite attribute of the session cookie.
     */
    sameSite?: boolean | 'lax' | 'strict' | 'none';
    /**
     * Priority of the session cookie.
     */
    priority?: 'low' | 'medium' | 'high';
}

export interface SessionOptions {
    /**
     * Secret used to sign the session cookie.
     */
    secret: string | string[];
    /**
     * Name of the session cookie.
     */
    name?: string;
    /**
     * Store to use for session data.
     */
    store?: Store;
    /**
     * Options for the session cookie.
     */
    cookie?: SessionCookieOptions;
    /**
     * Function to generate a session ID.
     */
    genid?: (ctx: ShokupanContext) => string;
    /**
     * Whether to force a session identifier cookie to be set on every response.
     */
    resave?: boolean;
    /**
     * Whether to save the session on every request.
     */
    saveUninitialized?: boolean;
    /**
     * Whether to update the session cookie on every request.
     */
    rolling?: boolean;
    /**
     * Whether to destroy or keep the session on logout.
     */
    unset?: 'destroy' | 'keep';
}

export interface Store extends EventEmitter {
    /**
     * Retrieves a session by ID.
     */
    get(sid: string, callback: (err: any, session?: SessionData | null) => void): void;
    /**
     * Stores a session.
     */
    set(sid: string, session: SessionData, callback?: (err?: any) => void): void;
    /**
     * Destroys a session.
     */
    destroy(sid: string, callback?: (err?: any) => void): void;
    /**
     * Touches a session.
     */
    touch?(sid: string, session: SessionData, callback?: (err?: any) => void): void;
    /**
     * Retrieves all sessions.
     */
    all?(callback: (err: any, obj?: { [sid: string]: SessionData; } | null) => void): void;
    /**
     * Retrieves the number of sessions.
     */
    length?(callback: (err: any, length?: number) => void): void;
    /**
     * Clears all sessions.
     */
    clear?(callback?: (err?: any) => void): void;
    /**
     * Loads a session.
     */
    load?(sid: string, fn: (err: any, session?: SessionData | null) => void): void;
    /**
     * Creates a session.
     */
    createSession?(req: any, session: SessionData): SessionData;
}

// --- Cookie Helper ---

class Cookie implements SessionCookieOptions {
    maxAge?: number;
    signed?: boolean;
    expires?: Date;
    httpOnly?: boolean;
    path?: string;
    domain?: string;
    secure?: boolean | 'auto';
    sameSite?: boolean | 'lax' | 'strict' | 'none';
    originalMaxAge: number | undefined;

    constructor(options: SessionCookieOptions = {}) {
        this.path = options.path || '/';
        this.httpOnly = options.httpOnly !== undefined ? options.httpOnly : true;
        this.secure = options.secure;
        this.maxAge = options.maxAge;
        this.sameSite = options.sameSite;
        this.domain = options.domain;
        this.expires = options.expires;

        if (this.maxAge !== undefined) {
            this.originalMaxAge = this.maxAge;
            this.expires = new Date(Date.now() + this.maxAge);
        }
    }

    serialize(name: string, val: string) {
        let str = `${name}=${encodeURIComponent(val)}`;

        if (this.maxAge) {
            const expires = new Date(Date.now() + this.maxAge);
            str += `; Expires=${expires.toUTCString()}`;
            // Also add Max-Age?
            str += `; Max-Age=${Math.floor(this.maxAge / 1000)}`;
        } else if (this.expires) {
            str += `; Expires=${this.expires.toUTCString()}`;
        }

        if (this.domain) str += `; Domain=${this.domain}`;
        if (this.path) str += `; Path=${this.path}`;
        if (this.httpOnly) str += `; HttpOnly`;
        if (this.secure) str += `; Secure`;
        if (this.sameSite) {
            const sameSite = typeof this.sameSite === 'string' ?
                this.sameSite.charAt(0).toUpperCase() + this.sameSite.slice(1) : 'Strict';
            str += `; SameSite=${sameSite}`;
        }

        return str;
    }
}

// --- Memory Store ---


export class MemoryStore extends EventEmitter implements Store {
    private sessions: Record<string, string> = {};

    get(sid: string, cb: (err: any, session?: SessionData | null) => void) {
        const sess = this.sessions[sid];
        if (!sess) return cb(null, null);
        try {
            const data = JSON.parse(sess);
            // Re-hydrate dates?
            if (data.cookie && data.cookie.expires) {
                data.cookie.expires = new Date(data.cookie.expires);
            }
            cb(null, data);
        } catch (e) {
            cb(e);
        }
    }

    set(sid: string, sess: SessionData, cb?: (err?: any) => void) {
        this.sessions[sid] = JSON.stringify(sess);
        cb?.();
    }

    destroy(sid: string, cb?: (err?: any) => void) {
        delete this.sessions[sid];
        cb?.();
    }

    touch(sid: string, sess: SessionData, cb?: (err?: any) => void) {
        const current = this.sessions[sid];
        if (current) {
            // Update the cookie expiry if needed without changing the whole object if we want to be efficient
            // But for MemoryStore, just set is fine
            this.sessions[sid] = JSON.stringify(sess);
        }
        cb?.();
    }

    all(cb: (err: any, obj?: { [sid: string]: SessionData; } | null) => void) {
        const result: Record<string, SessionData> = {};
        const sessionKeys = Object.keys(this.sessions);
        for (let i = 0; i < sessionKeys.length; i++) {
            const sid = sessionKeys[i];
            try {
                result[sid] = JSON.parse(this.sessions[sid]);
            } catch { }
        }
        cb(null, result);
    }

    clear(cb?: (err?: any) => void) {
        this.sessions = {};
        cb?.();
    }
}

// --- Crypto Helpers ---

function sign(val: string, secret: string) {
    if (typeof val !== 'string') throw new TypeError("Cookie value must be provided as a string.");
    if (typeof secret !== 'string') throw new TypeError("Secret string must be provided.");
    return val + '.' + createHmac('sha256', secret).update(val).digest('base64').replace(/\=+$/, '');
}

function unsign(input: string, secret: string) {
    if (typeof input !== 'string') throw new TypeError("Signed cookie string must be provided.");
    if (typeof secret !== 'string') throw new TypeError("Secret string must be provided.");
    const tentValue = input.slice(0, input.lastIndexOf('.'));
    const expectedInput = sign(tentValue, secret);

    // Security: Use constant-time comparison with padding to prevent timing attacks
    // Pad both buffers to the same length to avoid length-based timing leaks
    const maxLength = Math.max(expectedInput.length, input.length);
    const paddedExpected = Buffer.alloc(maxLength);
    const paddedInput = Buffer.alloc(maxLength);

    Buffer.from(expectedInput).copy(paddedExpected);
    Buffer.from(input).copy(paddedInput);

    // Use crypto.timingSafeEqual for constant-time comparison
    try {
        const valid = require('crypto').timingSafeEqual(paddedExpected, paddedInput);
        return valid ? tentValue : false;
    } catch {
        // Buffers are different lengths (shouldn't happen with padding, but handle gracefully)
        return false;
    }
}

// --- Middleware ---

export interface SessionContext {
    session: SessionData & {
        id: string;
        regenerate(callback: (err: any) => void): void;
        destroy(callback: (err: any) => void): void;
        reload(callback: (err: any) => void): void;
        save(callback: (err: any) => void): void;
        touch(): void;
    };
    sessionID: string;
    sessionStore: Store;
}

// Merge into ShokupanContext? TODO: Review.
declare module "../../context" {
    interface ShokupanContext {
        session: SessionContext['session'];
        sessionID: string;
        sessionStore: Store;
    }
}

/**
 * Session middleware.
 * @param options Session options
 * @returns Middleware function
 */
export function Session(options: SessionOptions): Middleware {
    const store = options.store || new MemoryStore();
    const name = options.name || 'connect.sid';
    const secrets = Array.isArray(options.secret) ? options.secret : [options.secret];

    // Validate store
    // (Could add check for .get .set .destroy)

    const generateId = options.genid || (() => randomUUID());

    const resave = options.resave === undefined ? true : options.resave;
    const saveUninitialized = options.saveUninitialized === undefined ? true : options.saveUninitialized;
    const rolling = options.rolling || false;

    const sessionMiddleware: Middleware = async function SessionMiddleware(ctx: ShokupanContext, next) {
        // 1. Get Session ID from Cookie
        let reqSessionId: string | null = null;
        let isSigned = false;

        // Simple cookie parser
        const cookieHeader = ctx.req.headers.get("cookie");
        const cookies: Record<string, string> = {};
        if (cookieHeader) {
            cookieHeader.split(';').forEach(c => {
                const [k, v] = c.split('=').map(s => s.trim());
                if (k && v) cookies[k] = decodeURIComponent(v);
            });
        }

        const rawCookie = cookies[name];

        if (rawCookie) {
            if (rawCookie.substr(0, 2) === 's:') {
                // Signed cookie
                const val = unsign(rawCookie.slice(2), secrets[0]);
                if (val) {
                    reqSessionId = val as string;
                    isSigned = true;
                }
            } else {
                reqSessionId = rawCookie;
            }
        }

        // 2. Generate new ID if none
        let sessionID = reqSessionId;
        let isNew = false;
        if (!sessionID) {
            sessionID = generateId(ctx);
            isNew = true;
        }

        // 3. Helper to wrap session object
        const createSessionObject = (data: SessionData | null): SessionContext['session'] => {
            const existing = data || { cookie: new Cookie(options.cookie) };
            if (!existing.cookie) existing.cookie = new Cookie(options.cookie);
            else {
                // re-hydrate cookie options methods
                const c = new Cookie(options.cookie); // defaults
                Object.assign(c, existing.cookie);
                // ensure expiry is date
                if (c.expires && typeof c.expires === 'string') c.expires = new Date(c.expires);
                existing.cookie = c;
            }

            const sessObj = existing as any;

            // Methods
            Object.defineProperty(sessObj, 'id', { value: sessionID, configurable: true });

            sessObj.save = (cb: any) => {
                store.set(sessObj.id, sessObj, cb);
            };

            sessObj.destroy = (cb: any) => {
                store.destroy(sessObj.id, (err) => {
                    // TODO: clear cookie?
                    if (cb) cb(err);
                });
            };

            sessObj.regenerate = (cb: any) => {
                store.destroy(sessObj.id, (err) => {
                    sessionID = generateId(ctx);
                    // Create new session object
                    // We actually need to replace the whole ctx.session object, which is tricky inside a method of that object.
                    // Typically middleware attaches a proxy or the consumer does this.
                    // But here we can reset properties.
                    const keys = Object.keys(sessObj);
                    for (let i = 0; i < keys.length; i++) {
                        const key = keys[i];
                        if (key !== 'cookie' && key !== 'id' && typeof sessObj[key] !== 'function') {
                            delete sessObj[key];
                        }
                    }
                    Object.defineProperty(sessObj, 'id', { value: sessionID, configurable: true });
                    if (cb) cb(err);
                });
            };

            sessObj.undefined = () => { }; // Helper? no
            sessObj.reload = (cb: any) => {
                store.get(sessObj.id, (err, sess) => {
                    if (err) return cb(err);
                    if (!sess) return cb(new Error("Session not found"));
                    // Populate
                    const keys = Object.keys(sessObj);
                    for (let i = 0; i < keys.length; i++) {
                        const key = keys[i];
                        if (key !== 'cookie' && key !== 'id' && typeof sessObj[key] !== 'function') {
                            delete sessObj[key];
                        }
                    }
                    Object.assign(sessObj, sess);
                    cb(null);
                });
            };

            sessObj.touch = () => {
                // Reset maxAge
                sessObj.cookie.expires = new Date(Date.now() + (sessObj.cookie.maxAge || 0));
                if (store.touch) store.touch(sessObj.id, sessObj);
            };

            return sessObj;
        };

        // 4. Load Session from Store
        let sessionData: SessionData | null = null;

        if (!isNew && sessionID) {
            await new Promise<void>((resolve) => {
                store.get(sessionID!, (err, sess) => {
                    if (err) {
                        // if error, treat as new? or error?
                        // express-session logs and creates new
                        sessionID = generateId(ctx);
                        isNew = true;
                    } else if (!sess) {
                        // Session expired or invalid
                        sessionID = generateId(ctx);
                        isNew = true;
                    } else {
                        sessionData = sess;
                    }
                    resolve();
                });
            });
        }

        const sess = createSessionObject(sessionData);

        ctx.session = sess;
        ctx.sessionID = sessionID!;
        ctx.sessionStore = store;

        // Hash original sessionStr to detect changes
        const originalHash = JSON.stringify(sess);

        // 5. Run next
        const result = await next();

        // 6. Save Logic
        const currentHash = JSON.stringify(sess);
        const isModified = originalHash !== currentHash;

        if (!sessionID) return result; // Destroyed?

        let shouldSave = false;

        if (isModified) {
            shouldSave = true;
        } else if (isNew && saveUninitialized) {
            shouldSave = true;
        } else if (!isNew && resave) {
            shouldSave = true;
        }

        if (shouldSave) {
            await new Promise<void>((resolve, reject) => {
                store.set(sessionID!, sess, (err) => {
                    if (err) console.error("Failed to save session", err);
                    resolve();
                });
            });
        }

        // 7. Set Cookie
        // Only set if new, or modified (rolling)
        // Express-session rules:
        // - if cookie.expires is set, it might need updating if rolling is true
        // - if isNew is true, definitely set cookie

        if (rolling && sess.cookie.maxAge) {
            sess.cookie.expires = new Date(Date.now() + sess.cookie.maxAge);
        }

        const shouldSetCookie = shouldSave || (!isNew && rolling);

        if (shouldSetCookie) {
            // value is just ID, or signed ID
            let val = sessionID;
            // We do simple signing s:id
            // Not enforcing secrets[0] yet
            if (secrets.length > 0) {
                val = 's:' + sign(val, secrets[0]);
            }

            const options = sess.cookie;
            // Serialize
            const str = options.serialize(name, val);
            ctx.set("Set-Cookie", str);
        }

        return result;
    };
    sessionMiddleware.isBuiltin = true;
    sessionMiddleware.pluginName = 'Session';
    return sessionMiddleware;
}
