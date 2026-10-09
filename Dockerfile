# OmniFeed — single-container deploy (API + built client).
# Data lives in Supabase (Postgres + Storage), so the container is stateless
# and runs on any host (Render, Railway, Fly, Docker). No volume required.
FROM node:22-bookworm-slim

WORKDIR /app

# Install dependencies first for better layer caching (pg + supabase-js are pure JS).
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm install

# App source + client build.
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV OMNIFEED_SEED_MEDIA=svg

# The host injects PORT; the server reads process.env.PORT.
EXPOSE 4000
CMD ["npm", "start"]
