# Gestion Dépense — Add-on Home Assistant

Application de suivi des dépenses du compte commun, intégrée nativement dans Home Assistant via **Ingress** (interface dans la barre latérale) et **MQTT Discovery** (entités dans HA).

---

## 📦 Entités créées automatiquement dans Home Assistant

| Entité | Unité | Icône | Description |
|---|---|---|---|
| `sensor.virement_suggere` | € | `mdi:bank-transfer` | Montant de régularisation à virer |
| `sensor.total_depenses` | € | `mdi:cash-register` | Somme totale des dépenses enregistrées |

Ces entités sont regroupées sous l'appareil **"Gestion Compte Commun"** et se mettent à jour en temps réel à chaque ajout, modification ou suppression d'une dépense.

---

## 🚀 Installation via GitHub (méthode recommandée)

C'est la façon la plus simple d'installer cet add-on : Home Assistant télécharge et construit tout automatiquement depuis ce dépôt GitHub.

### Prérequis

1. **Home Assistant OS** ou **Home Assistant Supervised** (les add-ons ne fonctionnent pas avec Home Assistant Container ou Core).
2. **L'add-on Mosquitto broker** installé et démarré  
   → `Paramètres` > `Modules complémentaires` > Rechercher **Mosquitto broker** > Installer & Démarrer.
3. **L'intégration MQTT** configurée  
   → `Paramètres` > `Appareils et services` > `Ajouter une intégration` > **MQTT** > connecter à `localhost`.

---

### Étape 1 — Ajouter le dépôt GitHub dans Home Assistant

1. Dans Home Assistant, allez dans :  
   **`Paramètres`** > **`Modules complémentaires`** > **`Boutique des modules complémentaires`**

2. Cliquez sur le menu **⋮** (trois points en haut à droite).

3. Sélectionnez **"Dépôts"** (ou "Repositories").

4. Dans le champ de texte, collez l'URL du dépôt GitHub :
   ```
   https://github.com/glouglou49/gestion_depenses
   ```

5. Cliquez sur **"Ajouter"** puis fermez la fenêtre.

---

### Étape 2 — Installer l'add-on

1. La boutique se recharge automatiquement. Cherchez **"Gestion Dépense"** dans la liste — il apparaît dans la section **"Local add-ons"** (ou tout en bas de la page).

2. Cliquez dessus, puis cliquez sur **"Installer"**.

3. Home Assistant va cloner le dépôt et construire l'image Docker.  
   ⏳ Cela peut prendre **3 à 5 minutes** la première fois.

> Si l'add-on n'apparaît pas après le rechargement, essayez le menu ⋮ > **"Recharger"** manuellement.

---

### Étape 3 — Afficher dans la barre latérale

1. Sur la page de l'add-on, dans l'onglet **"Info"**, activez :  
   ✅ **"Afficher dans la barre latérale"**

2. L'application est immédiatement accessible depuis le menu de gauche, sans authentification supplémentaire (gérée par Ingress).

---

### Étape 4 — Démarrer l'add-on

1. Cliquez sur **"Démarrer"**.
2. Activez optionnellement :  
   ✅ **"Démarrer au démarrage du système"**

---

### Étape 5 — Vérifier les entités MQTT

Une fois l'add-on démarré :

1. Allez dans **`Paramètres`** > **`Appareils et services`** > **`MQTT`**.
2. Vous devriez voir l'appareil **"Gestion Compte Commun"** avec ses deux capteurs.
3. Pour les utiliser dans un tableau de bord, ajoutez une carte Lovelace avec :
   - `sensor.total_depenses`
   - `sensor.virement_suggere`

---

## 🔄 Mise à jour de l'add-on

Quand une nouvelle version est publiée sur GitHub :

1. **`Paramètres`** > **`Modules complémentaires`** > **"Gestion Dépense"**
2. Un bouton **"Mettre à jour"** apparaît si une nouvelle version est disponible (basée sur le champ `version` dans `config.yaml`).
3. Cliquez dessus — HA re-télécharge et reconstruit l'image automatiquement.

> ⚠️ La base de données SQLite est stockée dans `/data` (persistant) et **n'est pas affectée** par les mises à jour.

---

## 📁 Installation manuelle (alternative sans GitHub)

<details>
<summary>Cliquez pour déployer via Samba ou SSH</summary>

Si vous préférez installer sans passer par GitHub (réseau isolé, test local…) :

### Via Samba (Windows)

1. Activez l'add-on **Samba share** dans HA.
2. Ouvrez `\\<IP_DE_VOTRE_HA>\addons\` dans l'Explorateur.
3. Créez un dossier `gestion_depense/` et copiez tous les fichiers du projet dedans.
4. Dans HA : `Boutique` > **⋮** > **"Recharger"**.
5. Cherchez **"Gestion Dépense"** dans les add-ons locaux.

### Via SSH

```bash
ssh root@<IP_DE_VOTRE_HA>
mkdir -p /addons/gestion_depense

# Depuis votre machine locale :
scp -r "/chemin/vers/Gestion depense/"* root@<IP>:/addons/gestion_depense/
```

</details>

---

## 🐳 Build Docker standalone (sans Home Assistant)

Pour tester l'image en dehors de HA :

```bash
# Construction
docker build --build-arg BUILD_FROM=node:20-alpine -t gestion-depense .

# Lancement
docker run -d \
  -p 80:80 \
  -v gestion-depense-data:/data \
  --name gestion-depense \
  gestion-depense

# Accéder à l'app : http://localhost
```

Avec MQTT :

```bash
docker run -d \
  -p 80:80 \
  -v gestion-depense-data:/data \
  -e MQTT_HOST=192.168.1.100 \
  -e MQTT_USER=mon_utilisateur \
  -e MQTT_PASSWORD=mon_mot_de_passe \
  --name gestion-depense \
  gestion-depense
```

---

## 🛠️ Développement local

```bash
npm install
npm run dev:full
# Frontend : http://localhost:5173
# API      : http://localhost:3001
```

La base de données est dans `data/frais.db` en développement local.

---

## 📁 Structure du projet

```
├── config.yaml       — Configuration de l'add-on HA
├── repository.yaml   — Métadonnées du dépôt pour HA
├── build.yaml        — Images de base HA par architecture
├── Dockerfile        — Build multi-stage (React + Node.js)
├── run.sh            — Script de démarrage HA (bashio)
├── server.js         — API Express + SQLite
├── ha_mqtt.js        — Module MQTT Discovery
├── src/              — Frontend React (Vite)
└── data/             — Base de données SQLite (dev local, ignoré par git)
```
