import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Calculator, Wallet, Coins, Percent, Plus, Trash2, Edit2, Check, X,
  HelpCircle, ArrowRightLeft, PiggyBank, TrendingUp, User, Users, Pencil, AlertCircle, Tag,
  Home, List, Settings, Database, Upload, Download
} from 'lucide-react';

// ─── Formatters ──────────────────────────────────────────────
const fmtCurrency = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
});

const fmtPercent = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const getMonthFromDate = (dateStr) => {
  if (!dateStr) return '';
  return dateStr.substring(0, 7); // 'YYYY-MM'
};

const formatMonth = (yyyyMm) => {
  if (!yyyyMm) return '';
  const [y, m] = yyyyMm.split('-');
  const date = new Date(y, m - 1);
  const text = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return text.charAt(0).toUpperCase() + text.slice(1);
};

// ─── API helpers (with error handling) ───────────────────────
async function apiFetch(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Erreur HTTP ${res.status}`);
  }
  return res.json();
}

const api = {
  getSettings: () => apiFetch('/api/settings'),
  saveSettings: (data) => apiFetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  getExpenses: () => apiFetch('/api/expenses'),
  addExpense: (name, amount, payer, category, type, date) => apiFetch('/api/expenses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, amount, payer, category, type, date }),
  }),
  updateExpense: (id, name, amount, payer, category, type, date) => apiFetch(`/api/expenses/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, amount, payer, category, type, date }),
  }),
  deleteExpense: (id) => apiFetch(`/api/expenses/${id}`, { method: 'DELETE' }),
};

// ─── Payer helpers ───────────────────────────────────────────
const payerBadgeClass = (p) => {
  if (p === 'person1') return 'bg-blue-100 text-blue-700';
  if (p === 'person2') return 'bg-violet-100 text-violet-700';
  return 'bg-gray-100 text-gray-600';
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sub‑components
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function StatTile({ icon, label, value, sub, valueClass = 'text-gray-800' }) {
  return (
    <div className="bg-white/70 rounded-xl p-3">
      <p className="flex items-center gap-1 text-xs text-gray-500 mb-1">
        {icon} {label}
      </p>
      <p className={`text-base font-bold ${valueClass}`}>{value}</p>
      {sub && <p className={`text-xs mt-0.5 font-medium ${valueClass}`}>{sub}</p>}
    </div>
  );
}

function ResultCard({ personLabel, colorTheme, percentage, target, paidExpenses, punctualAdvances, balance, remaining }) {
  const advances = paidExpenses + punctualAdvances;
  const isBlue = colorTheme === 'blue';
  const bgGradient = isBlue
    ? 'from-blue-50 to-blue-100/40'
    : 'from-violet-50 to-violet-100/40';
  const iconColor = isBlue ? 'text-blue-500' : 'text-violet-500';
  const headerColor = isBlue ? 'text-blue-800' : 'text-violet-800';
  const badgeBg = isBlue ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700';

  return (
    <section className={`card bg-gradient-to-br ${bgGradient}`}>
      <h3 className={`flex items-center gap-2 text-base font-semibold ${headerColor} mb-4`}>
        <User size={18} className={iconColor} />
        {personLabel}
        <span className={`ml-auto text-xs px-2.5 py-0.5 rounded-full font-medium ${badgeBg}`}>
          {fmtPercent.format(percentage)}
        </span>
      </h3>

      <div className="grid grid-cols-2 gap-3">
        <StatTile icon={<TrendingUp size={14} />} label="Part théorique" value={fmtCurrency.format(target)} />
        <StatTile icon={<Wallet size={14} />} label="Total Avances" value={fmtCurrency.format(advances)} />
        <div className="col-span-2 flex gap-4 text-xs mt-[-8px] mb-2 px-2 text-gray-500">
          <span>Achats : {fmtCurrency.format(paidExpenses)}</span>
          <span>Virements : {fmtCurrency.format(punctualAdvances)}</span>
        </div>
        <StatTile
          icon={<ArrowRightLeft size={14} />}
          label="Régularisation"
          value={fmtCurrency.format(Math.abs(balance))}
          sub={balance > 0.01 ? 'À virer' : balance < -0.01 ? 'À récupérer' : 'Équilibré'}
          valueClass={balance > 0.01 ? 'text-red-600' : balance < -0.01 ? 'text-green-600' : 'text-gray-700'}
        />
        <StatTile
          icon={<PiggyBank size={14} />}
          label="Reste à vivre"
          value={fmtCurrency.format(remaining)}
          valueClass={remaining >= 0 ? 'text-gray-800' : 'text-red-600'}
        />
      </div>
    </section>
  );
}

function TransferLine({ label, balance }) {
  if (Math.abs(balance) < 0.01) {
    return (
      <p className="text-gray-500">
        <strong>{label}</strong> : pas de régularisation nécessaire.
      </p>
    );
  }
  if (balance > 0) {
    return (
      <p>
        <strong>{label}</strong> doit virer{' '}
        <span className="font-semibold text-red-600">{fmtCurrency.format(balance)}</span> sur le
        compte commun.
      </p>
    );
  }
  return (
    <p>
      <strong>{label}</strong> doit récupérer{' '}
      <span className="font-semibold text-green-600">{fmtCurrency.format(Math.abs(balance))}</span>{' '}
      (avancé plus que sa part).
    </p>
  );
}

function CategoryManager({ categories, onAdd, onRemove, newCategoryName, onNewCategoryNameChange }) {
  return (
    <section className="card">
      <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800 mb-4">
        <Tag size={18} className="text-pink-500" />
        Catégories de Dépenses
      </h2>
      <div className="flex flex-wrap gap-2 mb-4">
        {categories.map(cat => (
          <span key={cat} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-gray-200 bg-gray-50 text-gray-700 text-sm font-medium">
            {cat}
            <button onClick={() => onRemove(cat)} className="text-gray-400 hover:text-red-500">
              <X size={14} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Nouvelle catégorie (ex: Alimentation)"
          className="input-field flex-1 text-sm"
          value={newCategoryName}
          onChange={(e) => onNewCategoryNameChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onAdd()}
        />
        <button className="btn-primary whitespace-nowrap px-4" onClick={onAdd}>
          Ajouter
        </button>
      </div>
    </section>
  );
}

function ExpenseForm({ categories, name1, name2, onAdd, submitting }) {
  const [newName, setNewName] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newPayer, setNewPayer] = useState('common');
  const [newCategory, setNewCategory] = useState(categories[0] || 'Autre');
  const [opType, setOpType] = useState('expense');
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (opType === 'advance' && newPayer === 'common') {
      setNewPayer('person1');
    }
  }, [opType, newPayer]);

  const handleAdd = async () => {
    const name = newName.trim();
    const amount = parseFloat(newAmount);
    if (!name || isNaN(amount) || amount <= 0) return;
    const finalAmount = opType === 'apport' ? -amount : amount;
    const finalType = opType === 'advance' ? 'advance' : 'expense';

    const success = await onAdd(name, finalAmount, newPayer, newCategory || 'Autre', finalType, opType === 'advance' ? newDate : '');
    if (success) {
      setNewName('');
      setNewAmount('');
      setNewPayer('common');
      setNewCategory(categories[0] || 'Autre');
      setOpType('expense');
      setNewDate(new Date().toISOString().slice(0, 10));
    }
  };

  return (
    <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2 items-end mb-6">
      <select
        className="input-field w-full sm:w-auto font-medium"
        value={opType}
        onChange={(e) => setOpType(e.target.value)}
        title="Type d'opération"
      >
        <option value="expense">Dépense (-)</option>
        <option value="apport">Apport (+)</option>
        <option value="advance">Avance (Virement)</option>
      </select>
      {opType === 'advance' && (
        <input
          type="date"
          className="input-field w-full sm:w-auto"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          title="Date de l'opération"
        />
      )}
      <input
        type="text"
        placeholder="Nom de la dépense"
        className="input-field flex-1 min-w-[150px]"
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
      />
      <div className="relative w-full sm:w-28">
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="Montant"
          className="input-field pr-8 w-full"
          value={newAmount}
          onChange={(e) => setNewAmount(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
      </div>
      <select
        className="input-field w-full sm:w-auto"
        value={newCategory}
        onChange={(e) => setNewCategory(e.target.value)}
      >
        {categories.map((cat) => (
          <option key={cat} value={cat}>{cat}</option>
        ))}
      </select>
      <select
        className="input-field w-full sm:w-auto"
        value={newPayer}
        onChange={(e) => setNewPayer(e.target.value)}
      >
        {opType !== 'advance' && <option value="common">Compte commun</option>}
        <option value="person1">{name1}</option>
        <option value="person2">{name2}</option>
      </select>
      <button
        className="btn-primary"
        onClick={handleAdd}
        disabled={submitting}
        title="Ajouter la dépense"
      >
        <Plus size={16} />
        <span className="sm:hidden">Ajouter</span>
      </button>
    </div>
  );
}

function ExpenseRow({ exp, name1, name2, categories, payerLabel, onEdit, onDelete }) {
  return (
    <li className="py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">
          {exp.type === 'advance' && (
            <span className="text-gray-500 mr-2 text-xs font-normal">
              {exp.date ? new Date(exp.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : ''}
            </span>
          )}
          {exp.type === 'advance' && <span className="text-blue-600 mr-1.5 font-bold">[Avance]</span>}
          {exp.amount < 0 && <span className="text-emerald-600 mr-1.5 font-bold">[Apport]</span>}
          {exp.name}
        </p>
        <div className="mt-1 flex items-center gap-2 flex-wrap text-xs">
          <span className={`px-2 py-0.5 rounded-full font-medium ${payerBadgeClass(exp.payer)}`}>
            {payerLabel(exp.payer)}
          </span>
          <span className="flex items-center gap-1 text-gray-500 bg-gray-100/80 px-2 py-0.5 rounded-full border border-gray-200">
            <Tag size={10} /> {exp.category || 'Autre'}
          </span>
        </div>
      </div>
      <span className={`text-sm font-semibold whitespace-nowrap ${exp.amount < 0 ? 'text-emerald-600' : 'text-gray-700'}`}>
        {exp.amount < 0 ? '+' : ''}{fmtCurrency.format(Math.abs(exp.amount))}
      </span>
      <button className="btn-icon" onClick={() => onEdit(exp)} title="Modifier">
        <Edit2 size={15} />
      </button>
    </li>
  );
}

function EditableExpenseRow({ exp, editForm, editOpType, name1, name2, categories, onFormChange, onOpTypeChange, onSave, onCancel, onDelete, submitting }) {
  useEffect(() => {
    if (editOpType === 'advance' && editForm.payer === 'common') {
      onFormChange({ ...editForm, payer: 'person1' });
    }
  }, [editOpType, editForm.payer]);

  return (
    <li className="py-3 flex flex-wrap items-center gap-2 bg-amber-50/50 -mx-4 px-4 rounded-lg">
      <select
        className="input-field w-auto font-medium"
        value={editOpType}
        onChange={(e) => onOpTypeChange(e.target.value)}
      >
        <option value="expense">Dépense (-)</option>
        <option value="apport">Apport (+)</option>
        <option value="advance">Avance (Virement)</option>
      </select>
      {editOpType === 'advance' && (
        <input
          type="date"
          className="input-field w-32"
          value={editForm.date || ''}
          onChange={(e) => onFormChange({ ...editForm, date: e.target.value })}
        />
      )}
      <input
        type="text"
        className="input-field flex-1 min-w-[120px]"
        value={editForm.name}
        onChange={(e) => onFormChange({ ...editForm, name: e.target.value })}
      />
      <div className="relative">
        <input
          type="number"
          min="0"
          step="0.01"
          className="input-field w-24 pr-8"
          value={editForm.amount}
          onChange={(e) => onFormChange({ ...editForm, amount: e.target.value })}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
      </div>
      <select
        className="input-field w-auto"
        value={editForm.category}
        onChange={(e) => onFormChange({ ...editForm, category: e.target.value })}
      >
        {categories.map((cat) => (
          <option key={cat} value={cat}>{cat}</option>
        ))}
      </select>
      <select
        className="input-field w-auto"
        value={editForm.payer}
        onChange={(e) => onFormChange({ ...editForm, payer: e.target.value })}
      >
        {editOpType !== 'advance' && <option value="common">Compte commun</option>}
        <option value="person1">{name1}</option>
        <option value="person2">{name2}</option>
      </select>
      <button className="btn-icon text-green-600 hover:bg-green-50" onClick={onSave} disabled={submitting} title="Valider">
        <Check size={18} />
      </button>
      <button className="btn-icon text-red-500 hover:bg-red-50" onClick={onCancel} title="Annuler">
        <X size={18} />
      </button>
      <button className="btn-icon text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => onDelete(exp.id)} title="Supprimer">
        <Trash2 size={18} />
      </button>
    </li>
  );
}

// ─── App ─────────────────────────────────────────────────────
export default function App() {
  const [salary1, setSalary1] = useState('');
  const [salary2, setSalary2] = useState('');
  const [name1, setName1] = useState('Personne 1');
  const [name2, setName2] = useState('Personne 2');
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Categories & Sort/Filter
  const [categories, setCategories] = useState(['Maison', 'Voiture', 'Divertissement', 'Enfant', 'Autre']);
  const [filterCategory, setFilterCategory] = useState('all');
  const [sortBy, setSortBy] = useState('date_desc');
  const [newCategoryName, setNewCategoryName] = useState('');

  // Inline edit
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', amount: '', payer: '', category: '', date: '' });
  const [editOpType, setEditOpType] = useState('expense');

  const [currentMonth, setCurrentMonth] = useState('');
  const [activeTab, setActiveTab] = useState('home');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportConfirmOpen, setIsImportConfirmOpen] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState(null);
  const fileInputRef = useRef(null);

  // Refs for current values (avoid stale closures in debounced saves)
  const settingsTimerRef = useRef(null);
  const settingsRef = useRef({ salary1: '', salary2: '', name1: 'Personne 1', name2: 'Personne 2' });

  // Keep ref in sync
  useEffect(() => {
    settingsRef.current = { salary1, salary2, name1, name2 };
  }, [salary1, salary2, name1, name2]);

  // ── Load data from API on mount ──
  useEffect(() => {
    async function load() {
      try {
        const [settings, expenseData] = await Promise.all([
          api.getSettings(),
          api.getExpenses(),
        ]);
        setSalary1(settings.salary1 || '');
        setSalary2(settings.salary2 || '');
        setName1(settings.name1 || 'Personne 1');
        setName2(settings.name2 || 'Personne 2');
        if (settings.categories) {
          try {
            const parsed = JSON.parse(settings.categories);
            setCategories(parsed);
          } catch (e) { console.error("Could not parse categories"); }
        }
        // Normalize amounts to numbers on load
        setExpenses(expenseData.map(e => ({ ...e, amount: Number(e.amount) })));
        setApiError(null);
      } catch (err) {
        console.error('Failed to load data:', err);
        setApiError('Impossible de charger les données. Vérifiez que le serveur est lancé.');
      } finally {
        setLoading(false);
      }
    }
    load();
    
    return () => {
      if (settingsTimerRef.current) clearTimeout(settingsTimerRef.current);
    };
  }, []);

  // ── Save settings (debounced, uses ref to avoid stale closures) ──
  const debouncedSaveSettings = useCallback((overrides = {}) => {
    if (settingsTimerRef.current) clearTimeout(settingsTimerRef.current);
    settingsTimerRef.current = setTimeout(async () => {
      try {
        await api.saveSettings({ ...settingsRef.current, ...overrides });
        setApiError(null);
      } catch (err) {
        console.error('Failed to save settings:', err);
        setApiError('Erreur lors de la sauvegarde des paramètres.');
      }
    }, 500);
  }, []);

  const handleSalary1Change = (e) => {
    const val = e.target.value;
    setSalary1(val);
    debouncedSaveSettings({ salary1: val });
  };

  const handleSalary2Change = (e) => {
    const val = e.target.value;
    setSalary2(val);
    debouncedSaveSettings({ salary2: val });
  };

  const handleName1Change = (e) => {
    const val = e.target.value;
    setName1(val);
    debouncedSaveSettings({ name1: val });
  };

  const handleName2Change = (e) => {
    const val = e.target.value;
    setName2(val);
    debouncedSaveSettings({ name2: val });
  };

  const availableMonths = useMemo(() => {
    const months = new Set();
    expenses.forEach(e => {
      if (e.type === 'advance' && e.date) months.add(getMonthFromDate(e.date));
    });
    const current = getMonthFromDate(new Date().toISOString());
    months.add(current);
    return Array.from(months).sort().reverse();
  }, [expenses]);

  useEffect(() => {
    if (!currentMonth && availableMonths.length > 0) {
      setCurrentMonth(availableMonths[0]);
    }
  }, [availableMonths, currentMonth]);

  const visibleExpenses = useMemo(() => {
    if (!currentMonth) return [];
    return expenses.filter(e => e.type !== 'advance' || getMonthFromDate(e.date) === currentMonth);
  }, [expenses, currentMonth]);

  // ── Calculations ──
  const stats = useMemo(() => {
    const s1 = (parseFloat(salary1) || 0) / 12;
    const s2 = (parseFloat(salary2) || 0) / 12;
    const totalRevenue = s1 + s2;

    const pct1 = totalRevenue > 0 ? s1 / totalRevenue : 0;
    const pct2 = totalRevenue > 0 ? s2 / totalRevenue : 0;

    const totalExpenses = expenses
      .filter(e => e.type !== 'advance')
      .reduce((sum, e) => sum + e.amount, 0);

    const target1 = totalExpenses * pct1;
    const target2 = totalExpenses * pct2;

    const paidExpenses1 = expenses
      .filter((e) => e.payer === 'person1' && e.type !== 'advance')
      .reduce((sum, e) => sum + e.amount, 0);
    const punctualAdvances1 = visibleExpenses
      .filter((e) => e.payer === 'person1' && e.type === 'advance')
      .reduce((sum, e) => sum + e.amount, 0);
    const advances1 = paidExpenses1 + punctualAdvances1;

    const paidExpenses2 = expenses
      .filter((e) => e.payer === 'person2' && e.type !== 'advance')
      .reduce((sum, e) => sum + e.amount, 0);
    const punctualAdvances2 = visibleExpenses
      .filter((e) => e.payer === 'person2' && e.type === 'advance')
      .reduce((sum, e) => sum + e.amount, 0);
    const advances2 = paidExpenses2 + punctualAdvances2;

    const balance1 = target1 - advances1;
    const balance2 = target2 - advances2;

    const remaining1 = s1 - target1;
    const remaining2 = s2 - target2;
    
    return {
      totalRevenue, pct1, pct2, totalExpenses,
      target1, target2, paidExpenses1, punctualAdvances1, paidExpenses2, punctualAdvances2, advances1, advances2,
      balance1, balance2, remaining1, remaining2
    };
  }, [salary1, salary2, expenses, visibleExpenses]);

  const recurringExpenses = useMemo(() => {
    return expenses.filter(e => e.type !== 'advance');
  }, [expenses]);

  const filteredAndSortedExpenses = useMemo(() => {
    let list = recurringExpenses;
    if (filterCategory !== 'all') {
      list = list.filter(e => (e.category || 'Autre') === filterCategory);
    }
    list = [...list].sort((a, b) => {
      if (sortBy === 'date_desc') return b.id - a.id;
      if (sortBy === 'date_asc') return a.id - b.id;
      if (sortBy === 'amount_desc') return b.amount - a.amount;
      if (sortBy === 'amount_asc') return a.amount - b.amount;
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'category') return (a.category || '').localeCompare(b.category || '');
      return 0;
    });
    return list;
  }, [recurringExpenses, filterCategory, sortBy]);

  const person1AdvancesList = useMemo(() => {
    return visibleExpenses.filter(e => e.type === 'advance' && e.payer === 'person1').sort((a, b) => b.id - a.id);
  }, [visibleExpenses]);

  const person2AdvancesList = useMemo(() => {
    return visibleExpenses.filter(e => e.type === 'advance' && e.payer === 'person2').sort((a, b) => b.id - a.id);
  }, [visibleExpenses]);

  const expensesByCategory = useMemo(() => {
    const grouped = {};
    filteredAndSortedExpenses.forEach(exp => {
      const cat = exp.category || 'Autre';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(exp);
    });
    return grouped;
  }, [filteredAndSortedExpenses]);

  // ── Category helpers ──
  const addCategory = useCallback(() => {
    const name = newCategoryName.trim();
    if (!name || categories.includes(name)) return;
    const newList = [...categories, name];
    setCategories(newList);
    setNewCategoryName('');
    debouncedSaveSettings({ categories: newList });
  }, [newCategoryName, categories, debouncedSaveSettings]);

  const removeCategory = useCallback((catName) => {
    const newList = categories.filter(c => c !== catName);
    setCategories(newList);
    debouncedSaveSettings({ categories: newList });
  }, [categories, debouncedSaveSettings]);

  // ── Excel export ──
  const exportExcel = useCallback(() => {
    const wb = XLSX.utils.book_new();
    const getPayerLabel = (p) => p === 'common' ? 'Compte commun' : p === 'person1' ? name1 : name2;

    const summaryData = [
      ["Résumé du Calculateur de Frais Communs", "", ""],
      [],
      ["Revenus nets imposables (annuels)", "Personne 1", "Personne 2"],
      ["", name1, name2],
      ["", parseFloat(salary1) || 0, parseFloat(salary2) || 0],
      [],
      ["Revenus nets (mensuels calculés)", stats.totalRevenue > 0 ? (parseFloat(salary1)||0)/12 : 0, stats.totalRevenue > 0 ? (parseFloat(salary2)||0)/12 : 0],
      ["Total mensuel (foyer)", stats.totalRevenue, ""],
      [],
      ["Répartition (Poids)", stats.pct1, stats.pct2],
      [],
      ["Total des dépenses", stats.totalExpenses, ""],
      [],
      ["Bilan Financier", name1, name2],
      ["Part théorique (Cible mensuelle)", stats.target1, stats.target2],
      ["Déjà avancé (Apports déduits)", stats.advances1, stats.advances2],
      ["Régularisation", stats.balance1, stats.balance2],
      ["Statut", 
         stats.balance1 > 0 ? 'À virer' : (stats.balance1 < 0 ? 'À récupérer' : 'Équilibré'),
         stats.balance2 > 0 ? 'À virer' : (stats.balance2 < 0 ? 'À récupérer' : 'Équilibré')
      ],
      [],
      ["Reste à vivre (mensuel)", stats.remaining1, stats.remaining2]
    ];

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    wsSummary['!cols'] = [{wch: 35}, {wch: 20}, {wch: 20}];
    XLSX.utils.book_append_sheet(wb, wsSummary, "Résumé");

    const expensesHeader = [['ID', 'Date', 'Nom', 'Montant', 'Catégorie', 'Payeur', 'Type', 'raw_payer', 'raw_type', 'raw_amount']];
    const expensesRows = expenses.map(e => [
      e.id, 
      e.date || e.created_at || '',
      e.name, 
      Math.abs(e.amount), 
      e.category || 'Autre',
      getPayerLabel(e.payer), 
      e.type === 'advance' ? 'Avance (Virement)' : (e.amount < 0 ? 'Apport (+)' : 'Dépense (-)'),
      e.payer,
      e.type,
      e.amount
    ]);

    const wsExpenses = XLSX.utils.aoa_to_sheet([...expensesHeader, ...expensesRows]);
    wsExpenses['!cols'] = [{wch: 5}, {wch: 20}, {wch: 30}, {wch: 10}, {wch: 20}, {wch: 15}, {wch: 18}, {hidden: true}, {hidden: true}, {hidden: true}];
    XLSX.utils.book_append_sheet(wb, wsExpenses, "Dépenses");

    const settingsData = [
      ['Clé', 'Valeur'],
      ['salary1', salary1],
      ['salary2', salary2],
      ['name1', name1],
      ['name2', name2],
      ['categories', JSON.stringify(categories)]
    ];
    const wsSettings = XLSX.utils.aoa_to_sheet(settingsData);
    XLSX.utils.book_append_sheet(wb, wsSettings, "Paramètres");

    XLSX.writeFile(wb, "Gestion_Depenses.xlsx");
  }, [expenses, name1, name2, salary1, salary2, stats, categories]);

  // ── CRUD helpers ──
  const addExpense = useCallback(async (name, amount, payer, category, type, date) => {
    setSubmitting(true);
    try {
      const created = await api.addExpense(name, amount, payer, category, type, date);
      setExpenses((prev) => [...prev, { ...created, amount: Number(created.amount) }]);
      setApiError(null);
      setIsAddModalOpen(false);
      return true;
    } catch (err) {
      console.error('Failed to add expense:', err);
      setApiError(err.message || 'Erreur lors de l\'ajout de la dépense.');
      return false;
    } finally {
      setSubmitting(false);
    }
  }, []);

  const removeExpense = useCallback(async (id) => {
    try {
      await api.deleteExpense(id);
      setExpenses((prev) => prev.filter((e) => e.id !== id));
      setEditingId((prev) => prev === id ? null : prev);
      setApiError(null);
    } catch (err) {
      console.error('Failed to delete expense:', err);
      setApiError(err.message || 'Erreur lors de la suppression de la dépense.');
    }
  }, []);

  const startEdit = useCallback((expense) => {
    setEditingId(expense.id);
    let op = 'expense';
    if (expense.type === 'advance') op = 'advance';
    else if (expense.amount < 0) op = 'apport';
    setEditOpType(op);
    setEditForm({ name: expense.name, amount: String(Math.abs(expense.amount)), payer: expense.payer, category: expense.category || 'Autre', date: expense.date || '' });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  const saveEdit = useCallback(async () => {
    const name = editForm.name.trim();
    const amount = parseFloat(editForm.amount);
    if (!name || isNaN(amount) || amount <= 0) return;
    
    const finalAmount = editOpType === 'apport' ? -amount : amount;
    const finalType = editOpType === 'advance' ? 'advance' : 'expense';
    
    setSubmitting(true);
    try {
      const datePayload = finalType === 'advance' ? editForm.date : '';
      const updated = await api.updateExpense(editingId, name, finalAmount, editForm.payer, editForm.category || 'Autre', finalType, datePayload);
      setExpenses((prev) =>
        prev.map((e) => (e.id === editingId ? { ...updated, amount: Number(updated.amount) } : e))
      );
      setEditingId(null);
      setApiError(null);
    } catch (err) {
      console.error('Failed to update expense:', err);
      setApiError(err.message || 'Erreur lors de la mise à jour de la dépense.');
    } finally {
      setSubmitting(false);
    }
  }, [editingId, editForm, editOpType]);


  const handleImportBackup = useCallback(async (file) => {
    if (!file) return;
    setSubmitting(true);
    try {
      const buffer = await file.arrayBuffer();
      
      if (typeof XLSX === 'undefined') {
        throw new Error("La bibliothèque XLSX n'est pas chargée !");
      }

      const wb = XLSX.read(buffer, { type: 'array' });
      
      let importedExpenses = undefined;
      let importedSettings = undefined;

      const expensesSheetName = wb.SheetNames.find(n => n.toLowerCase().includes('dépense') || n.toLowerCase().includes('depense'));
      if (expensesSheetName) {
        const rawExpenses = XLSX.utils.sheet_to_json(wb.Sheets[expensesSheetName]);
        importedExpenses = rawExpenses.map(row => ({
          id: row['ID'] || row['id'],
          date: row['Date'] || row['date'] || '',
          name: row['Nom'] || row['name'],
          amount: parseFloat(row['raw_amount'] ?? row['Montant'] ?? row['amount']) || 0,
          category: row['Catégorie'] || row['category'] || 'Autre',
          payer: row['raw_payer'] || row['payer'] || (row['Payeur'] === 'Compte commun' ? 'common' : (row['Payeur'] === name1 ? 'person1' : (row['Payeur'] === name2 ? 'person2' : 'common'))),
          type: row['raw_type'] || row['type'] || (row['Type']?.includes('Avance') ? 'advance' : 'expense')
        })).filter(e => e.name);
      }

      const settingsSheetName = wb.SheetNames.find(n => n.toLowerCase().includes('param'));
      if (settingsSheetName) {
        const rawSettings = XLSX.utils.sheet_to_json(wb.Sheets[settingsSheetName], { header: 1 });
        importedSettings = {};
        rawSettings.forEach(row => {
          if (row.length >= 2 && row[0] !== 'Clé') {
            importedSettings[row[0]] = row[1];
          }
        });
      }

      const payload = {};
      if (importedExpenses) payload.expenses = importedExpenses;
      if (importedSettings) payload.settings = importedSettings;

      if (Object.keys(payload).length === 0) {
        throw new Error("Aucune donnée valide trouvée dans le fichier.");
      }

      const res = await fetch('/api/backup/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur lors de la restauration');
      
      setIsImportConfirmOpen(false);
      setPendingImportFile(null);
      
      // On utilise un petit délai pour être sûr que le serveur a fini de traiter
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (err) {
      console.error(err);
      setApiError("Erreur d'importation : " + err.message);
    } finally {
      setSubmitting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [name1, name2]);

  // ── Payer label ──
  const payerLabel = useCallback((p) =>
    p === 'common' ? 'Compte commun' : p === 'person1' ? name1 : name2,
  [name1, name2]);

  // ── Loading state ──
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  return (
    
    <div className="min-h-screen bg-gray-50 pb-20 sm:pb-0">
      {/* ── Header & Tabs ── */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-xl text-white">
              <Calculator size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 tracking-tight">
                Frais Communs
              </h1>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {availableMonths.length > 0 && activeTab === 'home' && (
              <select
                className="input-field py-1.5 text-sm bg-gray-50 border-gray-200 font-semibold text-gray-800"
                value={currentMonth}
                onChange={(e) => setCurrentMonth(e.target.value)}
              >
                {availableMonths.map(m => (
                  <option key={m} value={m}>{formatMonth(m)}</option>
                ))}
              </select>
            )}
            <button 
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center justify-center w-10 h-10 bg-blue-600 text-white rounded-full shadow hover:bg-blue-700 transition-colors"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex border-b border-gray-100 overflow-x-auto hide-scrollbar">
            <button
              onClick={() => setActiveTab('home')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 py-3 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'home' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Home size={18} /> <span className="hidden sm:inline">Accueil</span>
            </button>
            <button
              onClick={() => setActiveTab('expenses')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 py-3 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'expenses' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <List size={18} /> <span className="hidden sm:inline">Dépenses récurrentes</span>
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 py-3 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'settings' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Settings size={18} /> <span className="hidden sm:inline">Paramètres</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      
        {/* Error notification */}
        {apiError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2 text-sm font-medium">
            <AlertCircle size={18} className="shrink-0" />
            <span className="flex-1">{apiError}</span>
            <button onClick={() => setApiError(null)} className="text-red-500 hover:text-red-700">
              <X size={16} />
            </button>
          </div>
        )}

        {/* ── TAB: HOME ── */}
        {activeTab === 'home' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              {stats.totalRevenue > 0 ? (
                <>
                  {/* Person 1 */}
                  <div className="space-y-3">
                    <ResultCard
                      personLabel={name1}
                      colorTheme="blue"
                      percentage={stats.pct1}
                      target={stats.target1}
                      paidExpenses={stats.paidExpenses1}
                      punctualAdvances={stats.punctualAdvances1}
                      balance={stats.balance1}
                      remaining={stats.remaining1}
                    />
                    {person1AdvancesList.length > 0 && (
                      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                        <h4 className="text-sm font-semibold text-gray-700 bg-gray-50 px-4 py-2 border-b border-gray-100">
                          Avances ponctuelles de {name1}
                        </h4>
                        <ul className="divide-y divide-gray-100 px-4">
                          {person1AdvancesList.map(exp => (
                            editingId === exp.id ? (
                              <EditableExpenseRow key={exp.id} exp={exp} editForm={editForm} editOpType={editOpType} name1={name1} name2={name2} categories={categories} onFormChange={setEditForm} onOpTypeChange={setEditOpType} onSave={saveEdit} onCancel={cancelEdit} onDelete={removeExpense} submitting={submitting} />
                            ) : (
                              <ExpenseRow key={exp.id} exp={exp} name1={name1} name2={name2} categories={categories} payerLabel={payerLabel} onEdit={startEdit} onDelete={removeExpense} />
                            )
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  {/* Person 2 */}
                  <div className="space-y-3">
                    <ResultCard
                      personLabel={name2}
                      colorTheme="violet"
                      percentage={stats.pct2}
                      target={stats.target2}
                      paidExpenses={stats.paidExpenses2}
                      punctualAdvances={stats.punctualAdvances2}
                      balance={stats.balance2}
                      remaining={stats.remaining2}
                    />
                    {person2AdvancesList.length > 0 && (
                      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                        <h4 className="text-sm font-semibold text-gray-700 bg-gray-50 px-4 py-2 border-b border-gray-100">
                          Avances ponctuelles de {name2}
                        </h4>
                        <ul className="divide-y divide-gray-100 px-4">
                          {person2AdvancesList.map(exp => (
                            editingId === exp.id ? (
                              <EditableExpenseRow key={exp.id} exp={exp} editForm={editForm} editOpType={editOpType} name1={name1} name2={name2} categories={categories} onFormChange={setEditForm} onOpTypeChange={setEditOpType} onSave={saveEdit} onCancel={cancelEdit} onDelete={removeExpense} submitting={submitting} />
                            ) : (
                              <ExpenseRow key={exp.id} exp={exp} name1={name1} name2={name2} categories={categories} payerLabel={payerLabel} onEdit={startEdit} onDelete={removeExpense} />
                            )
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <section className="card flex flex-col items-center justify-center text-center py-16 text-gray-400">
                  <Users size={40} className="mb-3 text-gray-300" />
                  <p className="text-sm">Renseignez les revenus dans les Paramètres pour voir la répartition.</p>
                </section>
              )}
            </div>

            <div className="space-y-6">
              {/* Summary Transfers */}
              {stats.totalRevenue > 0 && expenses.length > 0 && (
                <section className="card bg-gradient-to-br from-gray-50 to-white">
                  <h3 className="flex items-center gap-2 text-base font-semibold text-gray-800 mb-3">
                    <ArrowRightLeft size={18} className="text-emerald-500" />
                    Régularisation ({currentMonth ? formatMonth(currentMonth) : 'Globale'})
                  </h3>
                  <div className="space-y-2 text-sm">
                    <TransferLine label={name1} balance={stats.balance1} />
                    <TransferLine label={name2} balance={stats.balance2} />
                  </div>
                </section>
              )}

              {/* Total Expenses Summary */}
              {expenses.length > 0 && (
                <section className="card bg-white">
                  <h3 className="text-base font-semibold text-gray-800 mb-2">Total des Dépenses Récurrentes</h3>
                  <p className="text-3xl font-bold text-gray-900">{fmtCurrency.format(stats.totalExpenses)}</p>
                  <p className="text-sm text-gray-500 mt-1">Ceci correspond au socle des dépenses fixes du foyer.</p>
                </section>
              )}
            </div>
          </div>
        )}

        {/* ── TAB: EXPENSES ── */}
        {activeTab === 'expenses' && (
          <div className="space-y-6 max-w-4xl mx-auto">
            <section className="card">
              <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800 mb-4">
                <Coins size={18} className="text-amber-500" />
                Dépenses et Apports Récurrents
              </h2>

              <div className="flex flex-wrap items-center justify-between gap-3 mb-4 bg-gray-50/80 p-2 rounded border border-gray-100">
                <div className="flex flex-wrap items-center gap-2">
                  <select className="input-field py-1.5 text-sm bg-white border-gray-200" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                    <option value="all">Toutes catégories</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select className="input-field py-1.5 text-sm bg-white border-gray-200" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                    <option value="date_desc">Récent</option>
                    <option value="date_asc">Ancien</option>
                    <option value="amount_desc">Montant décroissant</option>
                    <option value="amount_asc">Montant croissant</option>
                    <option value="name">Nom</option>
                    <option value="category">Catégorie</option>
                  </select>
                </div>
                <button onClick={exportExcel} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-green-700 bg-white border border-green-200 rounded-md hover:bg-green-50 hover:text-green-800 transition-colors">
                  <Download size={15} /> Export Excel
                </button>
              </div>

              {filteredAndSortedExpenses.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">Aucune dépense récurrente ne correspond aux critères.</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(expensesByCategory).sort(([catA], [catB]) => catA.localeCompare(catB)).map(([cat, exps]) => {
                    const totalCat = exps.reduce((sum, e) => sum + e.amount, 0);
                    return (
                      <details key={cat} className="group bg-white rounded-lg border border-gray-100 shadow-sm" open>
                        <summary className="flex items-center gap-3 cursor-pointer select-none p-3 hover:bg-gray-50 list-none transition-colors rounded-lg">
                          <Tag size={16} className="text-blue-500" />
                          <h3 className="font-semibold text-gray-800 text-sm">{cat}</h3>
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{exps.length}</span>
                          <div className="ml-auto flex items-center gap-3">
                            <span className="font-bold text-gray-800 text-sm">{fmtCurrency.format(totalCat)}</span>
                            <span className="text-xs text-gray-400 group-open:rotate-90 transition-transform">▶</span>
                          </div>
                        </summary>
                        <div className="border-t border-gray-100 bg-gray-50/30">
                          <ul className="divide-y divide-gray-100 px-4">
                            {exps.map((exp) => editingId === exp.id ? (
                              <EditableExpenseRow key={exp.id} exp={exp} editForm={editForm} editOpType={editOpType} name1={name1} name2={name2} categories={categories} onFormChange={setEditForm} onOpTypeChange={setEditOpType} onSave={saveEdit} onCancel={cancelEdit} onDelete={removeExpense} submitting={submitting} />
                            ) : (
                              <ExpenseRow key={exp.id} exp={exp} name1={name1} name2={name2} categories={categories} payerLabel={payerLabel} onEdit={startEdit} onDelete={removeExpense} />
                            ))}
                          </ul>
                        </div>
                      </details>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ── TAB: SETTINGS ── */}
        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="card">
              <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800 mb-4">
                <Wallet size={18} className="text-blue-500" />
                Revenus nets imposables (annuels)
              </h2>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium text-blue-700 mb-1.5">
                    <User size={14} />
                    <input type="text" value={name1} onChange={handleName1Change} className="bg-transparent border-none outline-none font-medium text-blue-700 w-full placeholder:text-blue-400 focus:border-b focus:border-blue-300" placeholder="Nom" />
                    <Pencil size={10} className="text-blue-300 shrink-0" />
                  </label>
                  <div className="relative">
                    <input type="number" min="0" step="100" placeholder="ex : 30 000" className="input-field pr-8" value={salary1} onChange={handleSalary1Change} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
                  </div>
                  <div className="mt-1.5 ml-1 text-xs font-medium text-gray-500">Mensuel : {fmtCurrency.format((parseFloat(salary1) || 0) / 12)}</div>
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium text-violet-700 mb-1.5">
                    <User size={14} />
                    <input type="text" value={name2} onChange={handleName2Change} className="bg-transparent border-none outline-none font-medium text-violet-700 w-full placeholder:text-violet-400 focus:border-b focus:border-violet-300" placeholder="Nom" />
                    <Pencil size={10} className="text-violet-300 shrink-0" />
                  </label>
                  <div className="relative">
                    <input type="number" min="0" step="100" placeholder="ex : 24 000" className="input-field pr-8" value={salary2} onChange={handleSalary2Change} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
                  </div>
                  <div className="mt-1.5 ml-1 text-xs font-medium text-gray-500">Mensuel : {fmtCurrency.format((parseFloat(salary2) || 0) / 12)}</div>
                </div>
              </div>
              {stats.totalRevenue > 0 && (
                <div className="mt-4 flex flex-wrap gap-3 text-xs">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-medium"><Percent size={12} /> {name1} : {fmtPercent.format(stats.pct1)}</span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 font-medium"><Percent size={12} /> {name2} : {fmtPercent.format(stats.pct2)}</span>
                </div>
              )}
            </section>

            <CategoryManager categories={categories} onAdd={addCategory} onRemove={removeCategory} newCategoryName={newCategoryName} onNewCategoryNameChange={setNewCategoryName} />
            
            
            <section className="card">
              <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800 mb-4">
                <Database size={18} className="text-blue-500" />
                Base de Données
              </h2>
              <div className="flex flex-col sm:flex-row gap-4">
                <button 
                  type="button"
                  onClick={exportExcel}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-lg shadow-sm hover:bg-gray-50 transition-colors"
                >
                  <Download size={18} className="text-blue-500" />
                  Exporter (CSV/Excel)
                </button>
                
                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-white border border-red-200 text-red-600 text-sm font-semibold rounded-lg shadow-sm hover:bg-red-50 transition-colors cursor-pointer"
                >
                  <Upload size={18} />
                  Importer (CSV/Excel)
                </button>
                <input 
                  ref={fileInputRef}
                  type="file" 
                  accept=".csv,.xlsx" 
                  className="absolute opacity-0 w-0 h-0 overflow-hidden" 
                  style={{ zIndex: -1 }}
                  onChange={(e) => {
                    const selectedFile = e.target.files?.[0];
                    if (selectedFile) {
                      setPendingImportFile(selectedFile);
                      setIsImportConfirmOpen(true);
                    }
                  }} 
                />
              </div>
              <p className="mt-3 text-xs text-gray-500 leading-relaxed">
                Sauvegardez régulièrement vos données. <strong>Attention</strong> : la restauration d'une sauvegarde écrasera définitivement les données actuelles.
              </p>
            </section>
            
            <section className="card md:col-span-2 group">
              <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800 mb-4">
                <HelpCircle size={18} className="text-blue-500" />
                Comment ça marche ?
              </h2>
              <div className="space-y-3 text-sm text-gray-600 leading-relaxed">
                <p>Le calcul repose sur une <strong>répartition au prorata des revenus mensuels</strong>.</p>
                <ol className="list-decimal list-inside space-y-2 pl-1">
                  <li><strong>Revenu mensuel total</strong> = (Revenu Annuel 1 / 12) + (Revenu Annuel 2 / 12).</li>
                  <li><strong>Pourcentage (poids)</strong> = Revenu mensuel ÷ Revenu mensuel total.</li>
                  <li><strong>Part théorique (cible)</strong> = Total des dépenses récurrentes × Pourcentage.</li>
                  <li><strong>Avances</strong> = Somme des virements et achats ponctuels du mois.</li>
                  <li><strong>Régularisation</strong> = Part théorique − Avances.</li>
                </ol>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* ── Import Confirmation Modal ── */}
      {isImportConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={32} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Attention !</h3>
              <p className="text-gray-600 mb-6 leading-relaxed">
                L'importation du fichier <span className="font-semibold text-gray-900">"{pendingImportFile?.name}"</span> va 
                <span className="text-red-600 font-bold"> REMPLACER DÉFINITIVEMENT </span> 
                toutes vos données actuelles (dépenses et paramètres).
              </p>
              
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleImportBackup(pendingImportFile)}
                  className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors shadow-lg shadow-red-200 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Restauration en cours...
                    </>
                  ) : (
                    <>Confirmer le remplacement</>
                  )}
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setIsImportConfirmOpen(false);
                    setPendingImportFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Expense Modal ── */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50">
              <h3 className="text-lg font-semibold text-gray-800">Ajouter une opération</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-200 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto">
              <ExpenseForm
                categories={categories}
                name1={name1}
                name2={name2}
                onAdd={addExpense}
                submitting={submitting}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <footer className="text-center text-xs text-gray-400 pb-6">
        Calculateur de Frais Communs &mdash; Données stockées dans la base SQLite
      </footer>
    </div>
  );
}
