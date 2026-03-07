import { ShokupanRouter } from '../../../src/router';

export const HealthRouter = new ShokupanRouter();

HealthRouter.get("/", async (ctx) => {
    const t0 = Date.now();
    const [time] = await ctx.state.db.query("RETURN time::millis(time::now());");
    const d1 = Date.now() - t0;

    return ctx.json({
        t0,
        t1: time,
        d1
    });
});
