
import { AsyncApiPlugin } from '../plugins/application/asyncapi/plugin';
import { ShokupanRouter } from '../router';
import { Shokupan } from '../shokupan';

const router1 = new ShokupanRouter();
const router2 = new ShokupanRouter();

// Event with no description
router1.event('event.no_desc', (ctx) => {
    console.log('Handled event.no_desc');
});

// Event with no payload (implicit)
router1.event('event.no_payload', (ctx) => {
    console.log('Handled event.no_payload');
});

// Event emitted from multiple places
router1.get('/emit1', (ctx) => {
    ctx.emit('event.multi_emit', { source: 'route1' });
    return ctx.text('Emitted 1');
});

router2.get('/emit2', (ctx) => {
    ctx.emit('event.multi_emit', { source: 'route2' });
    return ctx.text('Emitted 2');
});

const app = new Shokupan({
    port: 3001,
    enableAsyncApiGen: true
});

app.mount('/r1', router1);
app.mount('/r2', router2);
app.register(new AsyncApiPlugin());

await app.listen();
console.log('Reproduction server listening on http://localhost:3001');
console.log('AsyncAPI available at http://localhost:3001/asyncapi');
