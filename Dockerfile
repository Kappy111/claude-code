# OmniFeed — single-container deploy (API + built client + SQLite + media).
# Works on Railway, Render, Fly, or any Docker host. Mount a persistent
# volume at /data so posts, accounts and uploads survive restarts.
FROM node:22-bookworm-slim

# Build tools for better-sqlite3 (native module).
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm install

# App source + client build.
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV OMNIFEED_DATA_DIR=/data
ENV OMNIFEED_SEED_MEDIA=svg
RUN mkdir -p /data

# The host (Railway/Render) injects PORT; the server reads process.env.PORT.
EXPOSE 4000
CMD ["npm", "start"]
