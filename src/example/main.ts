import { Convection } from '../convect';
import { ScalarPlugin } from '../plugins/scalar';
import { UserController } from './controller';
import { ServiceFetchRouter } from './service_fetch';

const app = new Convection({
    port: 3001,
    development: true
});

app.get("/", (ctx) => {
    throw new Error("test");
});

app.static("/static", {
    root: __dirname + "/static",
    listDirectory: true
});

// Mount Scalar OpenAPI Viewer
app.mount("/scalar", new ScalarPlugin({
    baseDocument: {
        info: {
            title: "Mixed Example",
            version: "1.0.0"
        }
    },
    config: {
    }
}));

app.mount("/api/user", UserController);
app.mount("/api/service_fetch", ServiceFetchRouter);

app.listen();