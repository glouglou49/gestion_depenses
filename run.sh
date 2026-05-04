#!/usr/bin/with-contenv bashio

# ── Gestion Dépense - Script de démarrage Home Assistant ──────
bashio::log.info "Démarrage de Gestion Dépense..."

# Assure que le dossier de données HA existe
mkdir -p /data

bashio::log.info "Base de données : /data/database.sqlite"
bashio::log.info "Port d'écoute  : 80"

# Démarre le serveur Node.js
exec node /app/server.js
