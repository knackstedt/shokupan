
import type { Shokupan } from "../../shokupan";
import type { ServerAdapter } from "./interface";

export class WinterCGAdapter implements ServerAdapter {
    async listen(port: number, app: Shokupan): Promise<any> {
        console.warn("WinterCGAdapter does not support 'listen()'. Use 'export default app' or invoke 'app.fetch' directly.");
        return {};
    }
}
