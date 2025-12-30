
import { Shokupan } from '../../src/shokupan';

export const implicitApp = new Shokupan();

implicitApp.get('/implicit-schema', (ctx) => {
    // Implicit return (void) but setting response
    ctx.json({
        name: 'test',
        id: 123
    });
});

implicitApp.get('/implicit-text', (ctx) => {
    ctx.text('implicit string');
});
