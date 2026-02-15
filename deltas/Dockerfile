# Deltas API - Bun/Elysia High Performance Ingestion Server
# Multi-stage build for minimal production image

FROM oven/bun:1 AS build
WORKDIR /app

# Cache dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source
COPY ./src ./src
COPY ./tsconfig.json ./

# Build standalone binary
ENV NODE_ENV=production
RUN bun build \
    --compile \
    --minify-whitespace \
    --minify-syntax \
    --target bun \
    --outfile server \
    src/index.ts

# Production stage - distroless for security
FROM gcr.io/distroless/base-debian12

# Copy binary with non-root ownership
COPY --chown=65532:65532 --from=build /app/server /app/server

# Switch to non-root user
USER nonroot

# Set working directory
WORKDIR /app

# Environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Run the server
CMD ["./server"]