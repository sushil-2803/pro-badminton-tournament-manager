FROM node:20-alpine

# Install build dependencies for native Node packages (e.g. sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package lists
COPY package*.json ./

# Install dependencies (production only)
RUN npm ci --omit=dev

# Copy application source
COPY . .

# Create persistent storage folder for SQLite
RUN mkdir -p /app/data && chown -R node:node /app

# Use non-root node user for security
USER node

# Expose backend port
EXPOSE 4000

# Setup production environment defaults
ENV PORT=4000
ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/database.sqlite

CMD ["node", "index.js"]
