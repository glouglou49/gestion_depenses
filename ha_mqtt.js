/**
 * ha_mqtt.js — Module MQTT Discovery pour Home Assistant
 *
 * Entités publiées :
 *   - sensor.gestion_depense_total_depenses
 *   - sensor.gestion_depense_p{N}_nom            (N = 1 à 9)
 *   - sensor.gestion_depense_p{N}_regularisation  (N = 1 à 9)
 *   - sensor.gestion_depense_p{N}_avances_mois    (N = 1 à 9)
 *
 * Priorité config MQTT :
 *   1. /data/options.json (UI HA)
 *   2. Variables d'env injectées par HA (services: mqtt:need)
 *   3. Graceful degradation (pas de MQTT)
 */

import mqtt from 'mqtt';
import { readFileSync } from 'fs';

// ─── Configuration ────────────────────────────────────────────
function loadMqttConfig() {
  let opts = {};
  try { opts = JSON.parse(readFileSync('/data/options.json', 'utf8')); } catch { /* dev local */ }
  return {
    host:     opts.mqtt_host     || process.env.MQTT_HOST,
    user:     opts.mqtt_user     || process.env.MQTT_USER,
    password: opts.mqtt_password || process.env.MQTT_PASSWORD,
    port:     opts.mqtt_port     || process.env.MQTT_PORT || 1883,
  };
}

const cfg         = loadMqttConfig();
const MQTT_HOST   = cfg.host;
const MQTT_PORT   = cfg.port;
const MQTT_USER   = cfg.user;
const MQTT_PASS   = cfg.password;

// ─── Device HA partagé ───────────────────────────────────────
const DEV_ID = 'gestion_compte_commun';
const DEVICE = {
  identifiers:  [DEV_ID],
  name:         'Gestion Compte Commun',
  model:        'Gestion Dépense Add-on',
  manufacturer: 'Home Assistant Community',
};

// ─── Helpers topics ──────────────────────────────────────────
const cfgTopic   = (k) => `homeassistant/sensor/gestion_depense_${k}/config`;
const stateTopic = (k) => `homeassistant/sensor/gestion_depense_${k}/state`;

// ─── Configs Discovery ───────────────────────────────────────
function buildDiscoveryConfigs() {
  const list = [];

  // Total des dépenses
  list.push({
    topic: cfgTopic('total'),
    payload: {
      unique_id: `${DEV_ID}_total`, object_id: 'gestion_depense_total_depenses',
      name: 'Total Dépenses', state_topic: stateTopic('total'),
      unit_of_measurement: '€', icon: 'mdi:cash-register',
      device_class: 'monetary', state_class: 'total',
      value_template: '{{ value | float | round(2) }}', device: DEVICE,
    },
  });

  // Par participant 1 à 9
  for (let i = 1; i <= 9; i++) {
    // Nom
    list.push({
      topic: cfgTopic(`p${i}_nom`),
      payload: {
        unique_id: `${DEV_ID}_p${i}_nom`, object_id: `gestion_depense_participant_${i}_nom`,
        name: `Participant ${i} - Nom`, state_topic: stateTopic(`p${i}_nom`),
        icon: 'mdi:account', device: DEVICE,
      },
    });
    // Régularisation
    list.push({
      topic: cfgTopic(`p${i}_regularisation`),
      payload: {
        unique_id: `${DEV_ID}_p${i}_reg`, object_id: `gestion_depense_participant_${i}_regularisation`,
        name: `Participant ${i} - Régularisation`, state_topic: stateTopic(`p${i}_regularisation`),
        unit_of_measurement: '€', icon: 'mdi:bank-transfer',
        device_class: 'monetary', state_class: 'measurement',
        value_template: '{{ value | float | round(2) }}', device: DEVICE,
      },
    });
    // Avances du mois courant
    list.push({
      topic: cfgTopic(`p${i}_avances_mois`),
      payload: {
        unique_id: `${DEV_ID}_p${i}_avmois`, object_id: `gestion_depense_participant_${i}_avances_mois`,
        name: `Participant ${i} - Avances Mois`, state_topic: stateTopic(`p${i}_avances_mois`),
        unit_of_measurement: '€', icon: 'mdi:calendar-month',
        device_class: 'monetary', state_class: 'measurement',
        value_template: '{{ value | float | round(2) }}', device: DEVICE,
      },
    });
  }

  return list;
}

// ─── Client MQTT (singleton) ─────────────────────────────────
let client  = null;
let isReady = false;

export function initMqtt() {
  if (!MQTT_HOST) {
    console.log('[MQTT] Aucun hôte configuré — mode sans MQTT.');
    return;
  }
  const url = `mqtt://${MQTT_HOST}:${MQTT_PORT}`;
  console.log(`[MQTT] Connexion : ${url} (user: ${MQTT_USER || 'anonyme'})`);

  client = mqtt.connect(url, {
    username: MQTT_USER, password: MQTT_PASS,
    clientId: `gestion_depense_${Math.random().toString(16).slice(2, 8)}`,
    clean: true, reconnectPeriod: 5000, connectTimeout: 10000,
  });

  client.on('connect', () => {
    console.log('[MQTT] ✅ Connecté.');
    isReady = true;
    // Supprimer l'ancienne entité virement_suggere (migration)
    client.publish('homeassistant/sensor/gestion_depense_virement/config', '', { retain: true });
    // Publier les nouvelles configs Discovery
    for (const { topic, payload } of buildDiscoveryConfigs()) {
      client.publish(topic, JSON.stringify(payload), { retain: true, qos: 1 }, (err) => {
        if (err) console.error(`[MQTT] Discovery erreur (${topic}):`, err.message);
        else console.log(`[MQTT] 📡 Discovery: ${topic}`);
      });
    }
  });

  client.on('error',     (err) => { console.error('[MQTT] ❌', err.message); isReady = false; });
  client.on('reconnect', ()    => { console.log('[MQTT] 🔄 Reconnexion...'); isReady = false; });
  client.on('close',     ()    => { isReady = false; });
}

// ─── Publication des états ────────────────────────────────────
/**
 * @param {object} data
 * @param {number}   data.totalDepenses
 * @param {Array}    data.participants   — [{ index, name, regularisation, avancesMois }]
 */
export function publishStates({ totalDepenses, participants }) {
  if (!client || !isReady) return;

  const pub = (key, val) => client.publish(stateTopic(key), String(val), { retain: true, qos: 1 });

  const round = (n) => Math.round(n * 100) / 100;

  pub('total', round(totalDepenses));

  for (const p of participants) {
    pub(`p${p.index}_nom`,           p.name || `Participant ${p.index}`);
    pub(`p${p.index}_regularisation`, round(p.regularisation));
    pub(`p${p.index}_avances_mois`,   round(p.avancesMois));
  }

  console.log(`[MQTT] 📤 États publiés — total: ${round(totalDepenses)}€, ${participants.length} participants`);
}
