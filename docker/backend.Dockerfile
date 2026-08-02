FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/backend/package.json packages/backend/package.json
COPY packages/frontend/package.json packages/frontend/package.json
COPY packages/shop-backend/package.json packages/shop-backend/package.json
COPY packages/custody-fixture/package.json packages/custody-fixture/package.json
RUN bun install --frozen-lockfile

COPY contracts/ contracts/
COPY scripts/ scripts/
COPY packages/shared/ packages/shared/
COPY packages/backend/ packages/backend/
COPY tsconfig.base.json tsconfig.base.json

RUN bun run --filter '@parcel-tracker/shared' build
RUN bun run compile
RUN bun run --filter '@parcel-tracker/backend' build

FROM oven/bun:1 AS runtime
WORKDIR /app

COPY --from=build /app/node_modules node_modules/
COPY --from=build /app/packages/shared/dist packages/shared/dist/
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/backend/dist packages/backend/dist/
COPY --from=build /app/packages/backend/package.json packages/backend/package.json
COPY --from=build /app/artifacts artifacts/
COPY package.json package.json

EXPOSE 3000
CMD ["bun", "run", "packages/backend/dist/main.js"]
