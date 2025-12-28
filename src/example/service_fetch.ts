import axios from 'axios';
import { ShokupanRouter } from '../router';

const router = new ShokupanRouter();

router.get("/service_fetch", async (ctx) => {
    const [data, data2] = await Promise.all([
        router.subRequest("/wines/red"),
        router.subRequest("/wines/white")
    ]);
    return { data, data2 };
});

router.get("/wines/red", (ctx) => axios.get("https://api.sampleapis.com/wines/reds").then(({ data }) => ctx.json(data)));
router.get("/wines/white", (ctx) => axios.get("https://api.sampleapis.com/wines/whites").then(({ data }) => ctx.json(data)));

export const ServiceFetchRouter = router;