# ── Build stage : compilation du frontend React ───────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Production stage : image de base Home Assistant ───────────
# BUILD_FROM est injecté par le builder HA selon l'architecture.
# Pour un build Docker local standard, passer :
#   docker build --build-arg BUILD_FROM=node:20-alpine -t gestion-depense .
ARG BUILD_FROM=node:20-alpine
FROM $BUILD_FROM
WORKDIR /app

# Installation des dépendances Node.js de production uniquement
COPY package*.json ./
RUN npm ci --omit=dev

# Copie du code serveur, du module MQTT et du frontend compilé
COPY server.js ./
COPY ha_mqtt.js ./
COPY --from=build /app/dist ./dist

# Script de démarrage HA (doit être exécutable)
COPY run.sh /run.sh
RUN chmod a+x /run.sh

# ── Variables d'environnement ─────────────────────────────────
ENV NODE_ENV=production
# /data est le dossier persistant standard des add-ons Home Assistant
ENV DB_PATH=/data/database.sqlite
ENV PORT=80

EXPOSE 80

# Le dossier /data est géré par HA (persistance automatique)
# VOLUME non nécessaire en mode add-on HA, mais utile en mode Docker standalone
VOLUME ["/data"]

CMD ["/run.sh"]
