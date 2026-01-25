
import { ShokupanRouter } from '../../../../router';

const router = new ShokupanRouter();

// Statically determinable (Literal)
router.get('/static-literal', ctx => ctx.text('ok'));

// Statically determinable (Expression)
const PREFIX = '/api';
const VERSION = 'v1';
router.get(PREFIX + '/' + VERSION + '/complex', ctx => ctx.text('ok'));

// Statically determinable (Template string)
router.get(`/api/${VERSION}/template`, ctx => ctx.text('ok'));

// Not statically determinable (Dynamic)
const DYNAMIC = process.env.FOO || 'foo';
router.get('/api/' + DYNAMIC, ctx => ctx.text('ok'));

// Not statically determinable (Dynamic expression)
router.get(`/api/${process.env.BAR}`, ctx => ctx.text('ok'));

// Dynamic Event
router.on('event-' + process.env.BAZ, () => { });

export default router;
