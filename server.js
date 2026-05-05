import express from 'express';
import Database from 'better-sqlite3';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initMqtt, publishStates } from './ha_mqtt.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Database setup ──────────────────────────────────────────
const DB_PATH = process.env.DB_PATH || join(__dirname, 'data', 'frais.db');

// Ensure data directory exists
import { mkdirSync } from 'fs';
mkdirSync(dirname(DB_PATH), { recursive: true });

let db;
let stmts;

function initDB() {
  if (db) {
    try { db.close(); } catch(e) {}
  }
  
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      payer TEXT NOT NULL DEFAULT 'common',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const upsertSetting = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
  upsertSetting.run('salary1', '');
  upsertSetting.run('salary2', '');
  upsertSetting.run('name1', 'Personne 1');
  upsertSetting.run('name2', 'Personne 2');
  upsertSetting.run('categories', JSON.stringify(['Maison', 'Voiture', 'Divertissement', 'Enfant', 'Autre']));

  try { db.exec(`ALTER TABLE expenses ADD COLUMN category TEXT DEFAULT 'Autre'`); } catch (e) {}
  try { db.exec(`ALTER TABLE expenses ADD COLUMN type TEXT DEFAULT 'expense'`); } catch (e) {}
  try {
    db.exec(`ALTER TABLE expenses ADD COLUMN date TEXT`);
    db.exec(`UPDATE expenses SET date = substr(created_at, 1, 10) WHERE date IS NULL`);
  } catch (e) {}

  stmts = {
    getSettings: db.prepare(`SELECT key, value FROM settings`),
    setSetting: db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`),
    getAllExpenses: db.prepare(`SELECT * FROM expenses ORDER BY date DESC, id DESC`),
    addExpense: db.prepare(`INSERT INTO expenses (name, amount, payer, category, type, date) VALUES (?, ?, ?, ?, ?, ?)`),
    updateExpense: db.prepare(`UPDATE expenses SET name = ?, amount = ?, payer = ?, category = ?, type = ?, date = ? WHERE id = ?`),
    deleteExpense: db.prepare(`DELETE FROM expenses WHERE id = ?`),
  };
}

initDB();

// Démarre la connexion MQTT (no-op si MQTT_HOST non défini)
initMqtt();


/**
 * Lit la DB, calcule les totaux et régularisations de chaque participant,
 * puis publie les états MQTT.
 *
 * Pour chaque participant N (1-9) qui a un nom configuré :
 *   - nom           : settings.nameN
 *   - regularisation: (totalDepenses / nbParticipants) - (paid_N + advances_N)
 *                     positif = doit encore payer, négatif = a trop avancé
 *   - avances_mois  : somme des avances (type=advance) du mois courant
 */
function computeAndPublish() {
  try {
    const allExpenses = stmts.getAllExpenses.all();

    // Settings pour récupérer les noms
    const settingsRows = stmts.getSettings.all();
    const settings = {};
    for (const row of settingsRows) settings[row.key] = row.value;

    // Mois courant au format YYYY-MM
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Total dépenses (hors avances)
    const totalDepenses = allExpenses
      .filter(e => e.type !== 'advance')
      .reduce((sum, e) => sum + Number(e.amount), 0);

    // Participants avec un nom configuré (1 à 9)
    const participants = [];
    for (let i = 1; i <= 9; i++) {
      const name = settings[`name${i}`];
      if (!name) continue;

      const pid = `person${i}`;

      const paid = allExpenses
        .filter(e => e.payer === pid && e.type !== 'advance')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      const advancesAll = allExpenses
        .filter(e => e.payer === pid && e.type === 'advance')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      const avancesMois = allExpenses
        .filter(e => e.payer === pid && e.type === 'advance'
                  && e.date && e.date.startsWith(currentMonth))
        .reduce((sum, e) => sum + Number(e.amount), 0);

      participants.push({ index: i, name, paid, advancesAll, avancesMois });
    }

    // Part équitable et régularisation
    const nb = participants.length || 1;
    const target = totalDepenses / nb;
    for (const p of participants) {
      p.regularisation = target - (p.paid + p.advancesAll);
    }

    publishStates({ totalDepenses, participants });
  } catch (err) {
    console.error('[MQTT] Erreur lors du calcul des états :', err.message);
  }
}

// ─── Validation helpers ──────────────────────────────────────
function validateExpenseInput(name, amount, payer, category, type, date) {
  const errors = [];
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.push('name is required and must be a non-empty string');
  }
  if (name && name.length > 200) {
    errors.push('name must be 200 characters or less');
  }
  if (amount == null || isNaN(Number(amount))) {
    errors.push('amount must be a valid number');
  }
  if (!payer || !['common', 'person1', 'person2'].includes(payer)) {
    errors.push('invalid payer value');
  }
  if (category && (typeof category !== 'string' || category.length > 100)) {
    errors.push('category must be a string of 100 characters or less');
  }
  if (type && !['expense', 'advance'].includes(type)) {
    errors.push('type must be expense or advance');
  }
  if (type === 'advance' && payer === 'common') {
    errors.push('advance payer cannot be common');
  }
  if (type === 'advance' && (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
    errors.push('date is required and must be in YYYY-MM-DD format for advances');
  }
  return errors;
}

function validatePositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0;
}

// ─── Express app ─────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// --- Health check ---
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Settings (salaries) ---
app.get('/api/settings', (_req, res) => {
  try {
    const rows = stmts.getSettings.all();
    const settings = {};
    for (const row of rows) settings[row.key] = row.value;
    res.json(settings);
  } catch (err) {
    console.error('GET /api/settings error:', err);
    res.status(500).json({ error: 'Failed to retrieve settings' });
  }
});

app.put('/api/settings', (req, res) => {
  try {
    const { salary1, salary2, name1, name2, categories } = req.body;
    const update = db.transaction(() => {
      if (salary1 !== undefined) stmts.setSetting.run('salary1', String(salary1));
      if (salary2 !== undefined) stmts.setSetting.run('salary2', String(salary2));
      if (name1 !== undefined) stmts.setSetting.run('name1', String(name1).substring(0, 100));
      if (name2 !== undefined) stmts.setSetting.run('name2', String(name2).substring(0, 100));
      if (categories !== undefined) {
        if (!Array.isArray(categories) || categories.some(c => typeof c !== 'string' || c.length > 100)) {
          throw new Error('categories must be an array of strings (max 100 chars each)');
        }
        stmts.setSetting.run('categories', JSON.stringify(categories));
      }
    });
    update();
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/settings error:', err);
    const status = err.message.includes('must be') ? 400 : 500;
    res.status(status).json({ error: err.message || 'Failed to update settings' });
  }
});

// --- Expenses CRUD ---
app.get('/api/expenses', (_req, res) => {
  try {
    res.json(stmts.getAllExpenses.all());
  } catch (err) {
    console.error('GET /api/expenses error:', err);
    res.status(500).json({ error: 'Failed to retrieve expenses' });
  }
});

app.post('/api/expenses', (req, res) => {
  try {
    const { name, amount, payer, category = 'Autre', type = 'expense', date } = req.body;
    const errors = validateExpenseInput(name, amount, payer, category, type, date);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join('; ') });
    }
    const parsedAmount = Number(amount);
    const result = stmts.addExpense.run(name.trim(), parsedAmount, payer, category, type, date);
    res.status(201).json({ id: result.lastInsertRowid, name: name.trim(), amount: parsedAmount, payer, category, type, date });
    computeAndPublish();
  } catch (err) {
    console.error('POST /api/expenses error:', err);
    res.status(500).json({ error: 'Failed to add expense' });
  }
});

app.put('/api/expenses/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!validatePositiveInt(id)) {
      return res.status(400).json({ error: 'id must be a positive integer' });
    }
    const { name, amount, payer, category = 'Autre', type = 'expense', date } = req.body;
    const errors = validateExpenseInput(name, amount, payer, category, type, date);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join('; ') });
    }
    const parsedAmount = Number(amount);
    const result = stmts.updateExpense.run(name.trim(), parsedAmount, payer, category, type, date, id);
    if (result.changes === 0) return res.status(404).json({ error: 'Expense not found' });
    res.json({ id, name: name.trim(), amount: parsedAmount, payer, category, type, date });
    computeAndPublish();
  } catch (err) {
    console.error('PUT /api/expenses/:id error:', err);
    res.status(500).json({ error: 'Failed to update expense' });
  }
});

app.delete('/api/expenses/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!validatePositiveInt(id)) {
      return res.status(400).json({ error: 'id must be a positive integer' });
    }
    const result = stmts.deleteExpense.run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Expense not found' });
    res.json({ ok: true });
    computeAndPublish();
  } catch (err) {
    console.error('DELETE /api/expenses/:id error:', err);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

// --- Serve static files in production ---
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, 'dist')));
  app.get('/{*path}', (_req, res) => {
    res.sendFile(join(__dirname, 'dist', 'index.html'));
  });
}

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});


// ─── JSON/Spreadsheet Backup Import ──────────────────────────
app.post('/api/backup/import', (req, res) => {
  console.log('Received backup import request', { 
    expenses: req.body.expenses?.length, 
    settings: req.body.settings ? Object.keys(req.body.settings).length : 0 
  });
  try {
    const { expenses, settings } = req.body;

    const importTx = db.transaction(() => {
      // Import settings if present
      if (settings && typeof settings === 'object') {
        for (const [key, value] of Object.entries(settings)) {
          stmts.setSetting.run(key, String(value));
        }
      }

      // Import expenses if present
      if (Array.isArray(expenses)) {
        db.prepare(`DELETE FROM expenses`).run();
        try {
          db.prepare(`DELETE FROM sqlite_sequence WHERE name='expenses'`).run();
        } catch(e) { /* ignore if sequence table doesn't exist */ }

        const insert = db.prepare(`INSERT INTO expenses (id, name, amount, payer, category, type, date) VALUES (?, ?, ?, ?, ?, ?, ?)`);
        for (const exp of expenses) {
          insert.run(
            exp.id || null,
            exp.name || 'Sans nom',
            exp.amount || 0,
            exp.payer || 'common',
            exp.category || 'Autre',
            exp.type || 'expense',
            exp.date || null
          );
        }
      }
    });

    importTx();
    res.json({ success: true, message: 'Restauration réussie avec succès.' });
    computeAndPublish();
  } catch (error) {
    console.error('Backup Import error:', error);
    res.status(500).json({ error: 'Erreur lors de la restauration: ' + error.message });
  }
});

// ─── Start server ────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ API server running on http://0.0.0.0:${PORT}`);
  console.log(`📁 Database: ${DB_PATH}`);
});
