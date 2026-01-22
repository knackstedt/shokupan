
import type { Server } from "bun";
import type { Shokupan } from "../../shokupan";

export interface ServerAdapter {
    /**
     * Start listening on the specified port.
     */
    listen(port: number, app: Shokupan): Promise<Server<any>>;

    /**
     * Stop the server.
     */
    stop?(): Promise<void>;
}
