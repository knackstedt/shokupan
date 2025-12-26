import { Convection } from "../convect";

const app = new Convection({
    port: 3000
});

app.get("/", async (ctx) => {
    return "Hello World!";
});

app.get("/json", async (ctx) => {
    return { message: "Hello JSON" };
});

if (require.main === module) {
    app.listen();
}
