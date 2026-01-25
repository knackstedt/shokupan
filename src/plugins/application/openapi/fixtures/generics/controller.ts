import { Controller, Get } from '../../../../index';

interface User {
    id: string;
    username: string;
    email: string;
}

interface Product {
    id: number;
    price: number;
}

@Controller('/generics')
export class GenericsController {

    @Get('/user')
    async getUser(): Promise<User> {
        return {
            id: '123',
            username: 'test',
            email: 'test@example.com'
        };
    }

    @Get('/users')
    async getUsers(): Promise<Array<User>> {
        return [];
    }

    // Wrapped in Promise
    @Get('/product')
    getProduct(): Promise<Product> {
        return Promise.resolve({ id: 1, price: 100 });
    }

    @Get('/inline')
    getInline(): Promise<{ id: number, price: number; }> {
        return Promise.resolve({ id: 1, price: 100 });
    }

    @Get('/mismatch')
    getMismatch(): Promise<{ explicit: string; }> {
        // Body returns something different to test precedence
        // @ts-ignore - Intentional mismatch for testing analyzer precedence
        return Promise.resolve({ inferred: 'string' });
    }
}
