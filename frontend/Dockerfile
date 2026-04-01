# Multi-stage build for optimized production image
FROM node:18-alpine AS build
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the React app for production
RUN npm run build

# Production stage - serve with static file server
FROM node:18-alpine
WORKDIR /app

# Install serve to serve static files
RUN npm install -g serve

# Copy build from previous stage
COPY --from=build /app/build /app/build

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S reactuser -u 1001
USER reactuser

EXPOSE 3000

# Serve the production build
CMD ["serve", "-s", "build", "-l", "3000"]
