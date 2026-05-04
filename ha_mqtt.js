/**
 * ha_mqtt.js — Module MQTT Discovery pour Home Assistant
 *
 * Gère la connexion au broker MQTT local de HA et publie les
 * messages de Discovery pour créer automatiquement deux entités :
 *   - sensor.gestion_depense_total_depenses
 *   - sensor.gestion_depense_virement_suggere
 *
 * Utilise les variables d'environnement injectées par HA :
 *   MQTT_HOST, MQTT_USER, MQTT_PASSWORD
 *
 * Graceful degradation : si MQTT_HOST n'est pas défini, le module
 * ne fait rien et l'application démarre normalement (utile en dev local).
 */

import mqtt from 'mqtt';

// ─── Configuration MQTT ───────────────────────────────────────
const MQTT_HOST     = process.env.MQTT_HOST;
const MQTT_USER     = process.env.MQTT_USER;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD;
const MQTT_PORT     = process.env.MQTT_PORT || 1883;

// ─── Topics ───────────────────────────────────────────────────
const DEVICE_ID = 'gestion_compte_commun';

const TOPICS = {
  totalConfig  : `homeassistant/sensor/gestion_depense_total/config`,
  totalState   : `homeassistant/sensor/gestion_depense_total/state`,
  virementConfig: `homeassistant/sensor/gestion_depense_virement/config`,
  virementState : `homeassistant/sensor/gestion_depense_virement/state`,
};

// ─── Device partagé ───────────────────────────────────────────
const DEVICE = {
  identifiers  : [DEVICE_ID],
  name         : 'Gestion Compte Commun',
  model        : 'Gestion Dépense Add-on',
  manufacturer : 'Home Assistant Community',
};

// ─── Payloads Discovery ───────────────────────────────────────
const DISCOVERY_CONFIGS = [
  {
    configTopic: TOPICS.totalConfig,
    stateTopic : TOPICS.totalState,
    payload    : {
      unique_id            : `${DEVICE_ID}_total_depenses`,
      name                 : 'Total Dépenses',
      state_topic          : TOPICS.totalState,
      unit_of_measurement  : '€',
      icon                 : 'mdi:cash-register',
      device_class         : 'monetary',
      state_class          : 'total',
      value_template       : '{{ value | float | round(2) }}',
      device               : DEVICE,
    },
  },
  {
    configTopic: TOPICS.virementConfig,
    stateTopic : TOPICS.virementState,
    payload    : {
      unique_id            : `${DEVICE_ID}_virement_suggere`,
      name                 : 'Virement Suggéré',
      state_topic          : TOPICS.virementState,
      unit_of_measurement  : '€',
      icon                 : 'mdi:bank-transfer',
      device_class         : 'monetary',
      state_class          : 'measurement',
      value_template       : '{{ value | float | round(2) }}',
      device               : DEVICE,
    },
  },
];

// ─── Client MQTT (singleton) ──────────────────────────────────
let client = null;
let isReady = false;

/**
 * Initialise la connexion MQTT et publie les configs Discovery.
 * Si MQTT_HOST n'est pas défini, la fonction est un no-op.
 */
export function initMqtt() {
  if (!MQTT_HOST) {
    console.log('[MQTT] MQTT_HOST non défini — mode sans MQTT (développement local).');
    return;
  }

  const brokerUrl = `mqtt://${MQTT_HOST}:${MQTT_PORT}`;
  console.log(`[MQTT] Connexion au broker : ${brokerUrl}`);

  client = mqtt.connect(brokerUrl, {
    username         : MQTT_USER,
    password         : MQTT_PASSWORD,
    clientId         : `gestion_depense_${Math.random().toString(16).slice(2, 8)}`,
    clean            : true,
    reconnectPeriod  : 5000,
    connectTimeout   : 10000,
  });

  client.on('connect', () => {
    console.log('[MQTT] ✅ Connecté au broker MQTT.');
    isReady = true;
    _publishDiscovery();
  });

  client.on('error', (err) => {
    console.error('[MQTT] ❌ Erreur broker :', err.message);
    isReady = false;
  });

  client.on('reconnect', () => {
    console.log('[MQTT] 🔄 Tentative de reconnexion...');
    isReady = false;
  });

  client.on('close', () => {
    isReady = false;
  });
}

/**
 * Publie les messages de Discovery MQTT (avec retain: true).
 * Appelé automatiquement à la connexion.
 * @private
 */
function _publishDiscovery() {
  for (const { configTopic, payload } of DISCOVERY_CONFIGS) {
    client.publish(
      configTopic,
      JSON.stringify(payload),
      { retain: true, qos: 1 },
      (err) => {
        if (err) {
          console.error(`[MQTT] Erreur publication Discovery (${configTopic}):`, err.message);
        } else {
          console.log(`[MQTT] 📡 Discovery publié : ${configTopic}`);
        }
      }
    );
  }
}

/**
 * Publie les états actuels des deux entités HA.
 * Appelé après chaque modification de la base de données.
 *
 * @param {number} totalDepenses   - Somme de toutes les dépenses (type !== 'advance')
 * @param {number} virementSuggere - Montant du virement de régularisation suggéré
 */
export function publishStates(totalDepenses, virementSuggere) {
  if (!client || !isReady) {
    // Pas connecté ou pas de MQTT configuré — on ignore silencieusement
    return;
  }

  const totalVal    = Math.round(totalDepenses * 100) / 100;
  const virementVal = Math.round(Math.abs(virementSuggere) * 100) / 100;

  client.publish(TOPICS.totalState,   String(totalVal),    { retain: true, qos: 1 });
  client.publish(TOPICS.virementState, String(virementVal), { retain: true, qos: 1 });

  console.log(`[MQTT] 📤 États publiés — Total: ${totalVal}€ | Virement: ${virementVal}€`);
}
