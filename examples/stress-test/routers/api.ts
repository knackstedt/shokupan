import { ShokupanRouter } from '../../../src/router';
import { UsersRouter } from './users';
import { ProductsRouter } from './products';
import { OrdersRouter } from './orders';
import { InventoryRouter } from './inventory';
import { AnalyticsRouter } from './analytics';

export class ApiRouter extends ShokupanRouter {
    constructor() {
        super({ name: 'API v1', group: 'api' });

        this.mount('/users', new UsersRouter());
        this.mount('/products', new ProductsRouter());
        this.mount('/orders', new OrdersRouter());
        this.mount('/inventory', new InventoryRouter());
        this.mount('/analytics', new AnalyticsRouter());
    }
}
