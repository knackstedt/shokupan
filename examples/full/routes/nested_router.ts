import { Cors } from '../../../src/plugins/middleware/cors';
import { RateLimitMiddleware } from '../../../src/plugins/middleware/rate-limit';
import { ShokupanRouter } from '../../../src/router';

const router = new ShokupanRouter();

router.use(Cors());

router.get("level1", (ctx) => {
    ctx.json({ message: Date.now() });
});

const router2 = new ShokupanRouter();
router2.use(RateLimitMiddleware({
    windowMs: 60 * 1000, // 1 minute
    max: 500, // 100 requests per minute
    message: { error: 'Too many requests, please try again later.' },
    headers: true
}));
router2.get("level2", (ctx) => {
    ctx.json({ message: Date.now() });
});

const router3 = new ShokupanRouter();
router3.get("level3", (ctx) => {
    ctx.json({ message: Date.now() });
});

router.mount("subpath1", router2);
router2.mount("subpath2", router3);

export const NestedRouter = router;