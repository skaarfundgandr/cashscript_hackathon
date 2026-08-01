import { cors } from '@elysiajs/cors';
import { Elysia } from 'elysia';
import { routes } from './presentation/routes.js';

const app = new Elysia()
  .use(cors())
  .use(routes)
  .listen(3000);

console.log(`Server running at http://localhost:${app.server?.port}`);
