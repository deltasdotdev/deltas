# Deltas App - SvelteKit Frontend
# Multi-stage build for optimal production image

FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .
ENV NODE_ENV=production
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app

# Copy built application
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules

# Environment
ENV NODE_ENV=production
ENV PORT=5173

# Expose port
EXPOSE 5173

# Create non-root user
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 --ingroup appgroup appuser && \
    chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Run the server
CMD ["node", "build"]