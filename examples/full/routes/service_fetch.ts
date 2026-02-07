import axios from 'axios';
import { ShokupanRouter } from '../../../src/router';

const router = new ShokupanRouter();

router.get("/service_fetch", async (ctx) => {
    const [data, data2] = await Promise.all([
        router.internalRequest("/wines/red"),
        router.internalRequest("/wines/white")
    ]);
    return { data, data2 };
});

router.get("/wines/red", (ctx) => axios.get("https://api.sampleapis.com/wines/reds").then(({ data }) => ctx.json(data as any)));
router.get("/wines/white", (ctx) => axios.get("https://api.sampleapis.com/wines/whites").then(({ data }) => ctx.json(data as any)));

export const ServiceFetchRouter = router;