# ── Build stage ──
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Production stage ──
FROM node:20-alpine
WORKDIR /app

# Copy only what's needed to run the server
COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY --from=build /app/dist ./dist

# Create data directory for SQLite
RUN mkdir -p /app/data

# The SQLite database will be stored in /app/data/frais.db
# Mount a Docker volume here to persist data across container restarts
ENV NODE_ENV=production
ENV DB_PATH=/app/data/frais.db
ENV PORT=80

EXPOSE 80
VOLUME ["/app/data"]
CMD ["node", "server.js"]
