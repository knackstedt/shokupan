
import { ShokupanRouter } from '../../../src/router';

export class TrackingDemoRouter extends ShokupanRouter {
    constructor() {
        super();

        // Middleware to modify state
        this.guard(async (ctx, next) => {
            ctx.state.visited = ctx.state.visited || [];
            ctx.state.visited.push('router-middleware');
            await next();
        });

        this.get('/', {
            summary: 'Middleware Tracking Demo',
            description: 'Returns the handler stack and state changes tracked during the request.'
        }, (ctx) => {
            ctx.state.visited.push('handler');
            ctx.state.finalMessage = "Hello from tracking demo";

            return ctx.json({
                message: "Middleware Tracking Demo",
                description: "This response shows the handlers visited and state changes recorded.",
                handlerStack: ctx.handlerStack
            });
        });
    }
}
