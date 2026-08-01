import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { Elysia } from 'elysia';
import { CUSTODY_URL, SHOP_DB } from './di/container.js';
import { MERCHANT_NAME } from './infrastructure/seed.js';
import { routes } from './presentation/routes.js';

const app = new Elysia()
  .use(cors())
  .use(swagger({
    documentation: {
      info: {
        title: 'Northbay Supply Shop API',
        version: '1.0.0',
        description: 'The merchant\'s own e-commerce backend. Owns products, orders, the buyer and the delivery-code plaintext; consumes custody as an integration.',
      },
      tags: [
        { name: 'Shop', description: 'Products, checkout and the buyer\'s order' },
      ],
    },
  }))
  .use(routes)
  .listen(Number(process.env.SHOP_PORT ?? 3001));

console.log(`${MERCHANT_NAME} shop running at http://localhost:${app.server?.port}`);
console.log(`  custody: ${CUSTODY_URL}`);
console.log(`  database: ${SHOP_DB}`);
