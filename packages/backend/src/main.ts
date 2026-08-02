import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { Elysia } from 'elysia';
import { routes } from './presentation/routes.js';

const app = new Elysia()
  .use(cors())
  .use(swagger({
    documentation: {
      info: {
        title: 'Hermes API',
        version: '2.0.0',
        description: 'Custody attestation layer for e-commerce delivery on Bitcoin Cash',
      },
      tags: [
        { name: 'Parcel', description: 'Parcel lifecycle operations' },
      ],
    },
  }))
  .use(routes)
  .listen(3000);

console.log(`Server running at http://localhost:${app.server?.port}`);
