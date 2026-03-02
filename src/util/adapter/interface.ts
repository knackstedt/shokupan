
import type { Server } from "bun";
import type { Shokupan } from "../../shokupan";
import type { TLSCertOptions } from '../dev-ssl';

export interface ServerAdapter {
    /**
     * Start listening on the specified port.
     */
    listen(port: number, app: Shokupan, tlsOptions: TLSCertOptions): Promise<Server<any>>;

    /**
     * Stop the server.
     */
    stop?(): Promise<void>;
}
