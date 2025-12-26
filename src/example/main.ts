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

app.static("/assets", {
    root: __dirname + "/static",
    listDirectory: true
});

app.static("/images", {
    root: __dirname + "/static/images",
    listDirectory: true
});

app.static("/files", {
    root: __dirname + "/static/files",
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