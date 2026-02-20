
import type { Server } from "bun";
import type { Shokupan } from "../../shokupan";
import type { ServerAdapter } from "./interface";

/**
 * @deprecated The H3Adapter has been removed.
 *
 * The "h3" adapter used the UnJS `h3` web framework as a transport layer and is
 * no longer supported. HTTP/3 / QUIC support is planned for a future release.
 */
export class H3Adapter implements ServerAdapter {
    async listen(_port: number, _app: Shokupan): Promise<Server<any>> {
        throw new Error(
            '[Shokupan] H3Adapter is deprecated and has been removed.\n\n' +
            'HTTP/3 / QUIC support is planned for a future release.\n' +
            'Track progress at: https://github.com/knackstedt/shokupan'
        );
    }

    async stop(): Promise<void> {
        // no-op
    }
}
