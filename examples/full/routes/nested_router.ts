import { ShokupanRouter } from '../../../src/router';

const router = new ShokupanRouter();

router.event("events/level1", (ctx) => {
    ctx.emit("pong", { message: Date.now() });
});
router.get("level1", (ctx) => {
    ctx.json({ message: Date.now() });
});

const router2 = new ShokupanRouter();
router2.event("events/level2", (ctx) => {
    ctx.emit("pong", { message: Date.now() });
});
router2.event("level2", (ctx) => {
    ctx.json({ message: Date.now() });
});

const router3 = new ShokupanRouter();
router3.event("events/level3", (ctx) => {
    ctx.emit("pong", { message: Date.now() });
});
router3.event("level3", (ctx) => {
    ctx.json({ message: Date.now() });
});

router.mount("subpath1", router2);
router2.mount("subpath2", router3);

export const NestedRouter = router;