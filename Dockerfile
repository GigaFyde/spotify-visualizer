FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# Install vite as dev dep for build step
COPY vite.config.ts tsconfig.json ./
RUN bun add -d vite

# Copy source
COPY server/ server/
COPY client/ client/

# Build client
RUN bunx vite build

# Remove dev dependencies and rebuild for production
RUN rm -rf node_modules && bun install --frozen-lockfile --production

# Production image
FROM oven/bun:1-slim
WORKDIR /app

COPY --from=base /app/node_modules node_modules/
COPY --from=base /app/dist/client dist/client/
COPY --from=base /app/server server/
COPY --from=base /app/package.json ./
COPY --from=base /app/tsconfig.json ./

EXPOSE 3000

CMD ["bun", "server/index.ts"]
