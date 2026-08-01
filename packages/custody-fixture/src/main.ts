import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { Elysia } from 'elysia';
import { B1, FIXTURE_DB } from './di/container.js';
import { assertFixturePkhs } from './infrastructure/fixture-keys.js';
import { routes } from './presentation/routes.js';

// Before anything binds a port: if a custody fixture key has moved, every pkh the frontend
// resolves to an actor is wrong, and this is the cheapest place to find out.
assertFixturePkhs();

const app = new Elysia()
  .use(cors())
  .use(swagger({
    documentation: {
      info: {
        title: 'ParcelTracker Custody Fixture',
        version: '1.0.0',
        description: 'The six custody routes with identical shapes, faked over SQLite. No chain, no signatures, no chipnet. See DIVERGENCE.md for every point where this differs from packages/backend.',
      },
      tags: [
        { name: 'Parcel', description: 'Parcel lifecycle operations' },
      ],
    },
  }))
  .use(routes)
  .listen(Number(process.env.FIXTURE_PORT ?? 3002));

console.log(`Custody fixture running at http://localhost:${app.server?.port}`);
console.log(`  B1: ${B1}${B1 === 'serve' ? ' (serves 0x04; B1=throw replays the real failure)' : ' (delivered parcels are unreadable, as on the real backend)'}`);
console.log(`  database: ${FIXTURE_DB}`);
