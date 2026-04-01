# Multi-stage build for optimized production image
FROM node:18-alpine AS build
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build if needed)
RUN npm ci

# Copy source code
COPY . .

# Production stage
FROM node:18-alpine
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy application code
COPY --from=build /app/src ./src
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/*.js ./

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodeuser -u 1001
RUN chown -R nodeuser:nodejs /app
USER nodeuser

EXPOSE 5000

# Start the server
CMD ["node", "src/server.js"]
