// Persistencia local (localStorage con respaldo en memoria). Los datos nunca salen del dispositivo.
export const MAX_INVOICES = 12;
const KEY = 'tarifas-luz:v1';

export const defaultState = () => ({
  invoices: [],
  settings: { kw: '', annualKwh: '', variationPct: 0, offersUrl: '', params: {} },
  conditions: { renewableOnly: false, noLockIn: false, noFee: false, fixed12: false, noIpc: false, excludeUnverified: false, basis: 'year1' },
  current: { name: '', energyPrice: '', powerP1: '', powerP2: '', monthlyFee: '' },
  renewal: { energyPrice: '', powerP1: '', powerP2: '', monthlyFee: '' },
  customOffers: null,
});

let memory = null;

export function loadState() {
  const base = defaultState();
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    raw = memory;
  }
  if (!raw) return base;
  try {
    const s = JSON.parse(raw);
    return {
      ...base,
      ...s,
      settings: { ...base.settings, ...(s.settings || {}) },
      conditions: { ...base.conditions, ...(s.conditions || {}) },
      current: { ...base.current, ...(s.current || {}) },
      renewal: { ...base.renewal, ...(s.renewal || {}) },
      invoices: Array.isArray(s.invoices) ? s.invoices.slice(0, MAX_INVOICES) : [],
    };
  } catch {
    return base;
  }
}

export function saveState(state) {
  const raw = JSON.stringify(state);
  try {
    localStorage.setItem(KEY, raw);
  } catch {
    memory = raw; // modo privado o almacenamiento bloqueado: solo en esta sesión
  }
}

/** Exporta solo los datos del usuario (sin las ofertas descargadas). */
export function exportUserData(state) {
  const { customOffers, ...user } = state; // eslint-disable-line no-unused-vars
  return JSON.stringify({ app: 'tarifas-luz', format: 1, exportedAt: new Date().toISOString().slice(0, 10), ...user }, null, 2);
}

/** Importa un JSON exportado; devuelve el estado nuevo o lanza Error con mensaje claro. */
export function importUserData(text, currentState) {
  let d;
  try {
    d = JSON.parse(text);
  } catch {
    throw new Error('El fichero no es un JSON válido.');
  }
  if (!d || d.app !== 'tarifas-luz' || !Array.isArray(d.invoices)) throw new Error('No parece un fichero exportado por esta aplicación.');
  const base = defaultState();
  const num = (x) => (x === '' || x == null || !Number.isFinite(Number(x)) ? '' : Number(x));
  const invoices = d.invoices.slice(0, MAX_INVOICES).map((f, i) => ({
    id: f.id || `imp${i}`,
    start: typeof f.start === 'string' ? f.start : '',
    end: typeof f.end === 'string' ? f.end : '',
    days: num(f.days),
    kw: num(f.kw),
    kwhP1: num(f.kwhP1),
    kwhP2: num(f.kwhP2),
    kwhP3: num(f.kwhP3),
    kwhTotal: num(f.kwhTotal),
    total: num(f.total),
  }));
  return {
    ...base,
    customOffers: currentState.customOffers,
    invoices,
    settings: { ...base.settings, ...(d.settings || {}) },
    conditions: { ...base.conditions, ...(d.conditions || {}) },
    current: { ...base.current, ...(d.current || {}) },
    renewal: { ...base.renewal, ...(d.renewal || {}) },
  };
}

/** Datos de ejemplo FICTICIOS (no corresponden a ninguna persona real). */
export function sampleInvoices() {
  const rows = [
    ['2026-01-05', '2026-02-04', 4.4, 70, 62, 118, 52.8],
    ['2026-02-04', '2026-03-06', 4.4, 66, 58, 110, 49.9],
    ['2026-03-06', '2026-04-05', 4.4, 58, 52, 98, 44.7],
    ['2026-04-05', '2026-05-05', 4.4, 49, 46, 90, 41.2],
    ['2026-05-05', '2026-06-04', 4.4, 45, 44, 84, 39.5],
    ['2026-06-04', '2026-07-04', 4.4, 52, 50, 96, 43.6],
  ];
  return rows.map(([start, end, kw, a, b, c, total], i) => ({
    id: `ej${i}`,
    start,
    end,
    days: Math.round((Date.parse(end) - Date.parse(start)) / 86400000),
    kw,
    kwhP1: a,
    kwhP2: b,
    kwhP3: c,
    kwhTotal: '',
    total,
  }));
}
