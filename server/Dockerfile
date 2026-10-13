FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/level-schema/package.json packages/level-schema/
COPY server/package.json server/
RUN corepack pnpm install --frozen-lockfile --filter @tinogames/server...
COPY . .
RUN corepack pnpm --filter @tinogames/level-schema build \
 && corepack pnpm --filter @tinogames/server build \
 && corepack pnpm deploy --filter @tinogames/server --prod /deploy

FROM node:24-alpine AS run
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /deploy ./
EXPOSE 8080
CMD ["node", "dist/index.js"]
