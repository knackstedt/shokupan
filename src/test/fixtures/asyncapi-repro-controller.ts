
import { ShokupanContext } from "../../context";
import { Controller, Event } from "../../util/decorators";

@Controller("/")
export class ReproController {
    @Event("ping")
    async onPing(ctx: ShokupanContext) {
        // Simple object literal
        ctx.emit("pong", { message: "pong" });
    }

    @Event("ping.sub")
    async onPingSub(ctx: ShokupanContext) {
        ctx.emit("pong.sub", { message: "pong.sub" });
    }

    @Event("complex")
    async onComplex(ctx: ShokupanContext) {
        // Variable usage (requires scope tracking)
        const data = { id: 123, status: "active" };
        ctx.emit("status", data);
    }
}
