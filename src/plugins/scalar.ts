import type { ApiReferenceConfiguration } from '@scalar/api-reference';
import type { OpenAPI } from '@scalar/openapi-types';
import { ConvectionRouter } from '../router';
import type { DeepPartial } from '../types';

export type ScalarPluginOptions = {
    baseDocument: DeepPartial<OpenAPI.Document>;
    config: ApiReferenceConfiguration;
};

export class ScalarPlugin extends ConvectionRouter<any> {
    constructor(
        private readonly pluginOptions: ScalarPluginOptions
    ) {
        super();
        this.init();
    }

    init() {
        this.get("/", ctx => {
            let path = ctx.url.toString();
            if (!path.endsWith("/")) path += "/";

            return ctx.html(`<!doctype html>
                <html>
                <head>
                    <title>API Reference</title>
                    <meta charset = "utf-8" />
                    <meta name="viewport" content = "width=device-width, initial-scale=1" />
                </head>

                <body>
                    <div id="app"></div>

                    <script src="${path}scalar.js"></script>
                    <script>
                        Scalar.createApiReference('#app', [{ ...${JSON.stringify(this.pluginOptions.baseDocument)},
                            url: "${path}openapi.json",
                        }
                    ])
                    </script>
                </body>

                </html>`);
        });
        this.get("/scalar.js", (ctx) => {
            return ctx.file(__dirname + "/../../node_modules/@scalar/api-reference/dist/browser/standalone.js");
        });
        this.get("/openapi.json", (ctx) => {
            return (this.root || this).generateApiSpec();
        });
    }
}