FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/frontend/package.json packages/frontend/package.json
COPY packages/backend/package.json packages/backend/package.json
COPY packages/shop-backend/package.json packages/shop-backend/package.json
COPY packages/custody-fixture/package.json packages/custody-fixture/package.json
RUN bun install --frozen-lockfile

COPY packages/shared/ packages/shared/
COPY packages/frontend/ packages/frontend/
COPY tsconfig.base.json tsconfig.base.json

RUN bun run --filter '@parcel-tracker/shared' build

ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL
RUN bun run --filter '@parcel-tracker/frontend' build

FROM oven/bun:1 AS runtime
WORKDIR /app

COPY --from=build /app/node_modules node_modules/
COPY --from=build /app/packages/shared/dist packages/shared/dist/
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/frontend/dist packages/frontend/dist/
COPY --from=build /app/packages/frontend/package.json packages/frontend/package.json
COPY --from=build /app/packages/frontend/vite.config.ts packages/frontend/vite.config.ts
COPY --from=build /app/packages/frontend/index.html packages/frontend/index.html
COPY package.json package.json

EXPOSE 5173
CMD ["bun", "run", "--filter", "@parcel-tracker/frontend", "preview", "--", "--host", "0.0.0.0", "--port", "5173"]
