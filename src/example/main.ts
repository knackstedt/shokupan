import { ScalarPlugin } from '../plugins/scalar';
import { Session } from '../plugins/session';
import { Shokupan } from '../shokupan';
import { UserController } from './controller';
import { ServiceFetchRouter } from './service_fetch';

type session = {
    profile: any,
    lastAccess: Date;
};

const app = new Shokupan<{
    session: session;
}>({
    port: 3001,
    development: true,
    enableOpenApiGen: true,
});

app.get("/", {
    summary: "Home",
    description: "Worldstar"
}, (ctx) => {
    return ctx.json({ msg: "Hello World" });
});

app.use(Session({ secret: "test" }));

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
// Import generated spec

app.mount('/scalar', new ScalarPlugin({
    enableStaticAnalysis: false,
    baseDocument: {
        info: {
            title: 'Shokupan API',
            version: '1.0.0'
        }
    },
    config: {}
}));
app.mount("/api/user", UserController);
app.mount("/api/service_fetch", ServiceFetchRouter);

app.listen();