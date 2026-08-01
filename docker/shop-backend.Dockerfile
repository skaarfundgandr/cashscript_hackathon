FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/shop-backend/package.json packages/shop-backend/package.json
RUN bun install --frozen-lockfile

COPY packages/shared/ packages/shared/
COPY packages/shop-backend/ packages/shop-backend/
COPY tsconfig.base.json tsconfig.base.json

RUN bun run --filter '@parcel-tracker/shared' build
RUN bun run --filter '@parcel-tracker/shop-backend' build

FROM oven/bun:1 AS runtime
WORKDIR /app

COPY --from=build /app/node_modules node_modules/
COPY --from=build /app/packages/shared/dist packages/shared/dist/
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/shop-backend/dist packages/shop-backend/dist/
COPY --from=build /app/packages/shop-backend/package.json packages/shop-backend/package.json
COPY package.json package.json

EXPOSE 3001
CMD ["bun", "run", "packages/shop-backend/dist/main.js"]
