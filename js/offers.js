// Validación y normalización del fichero de ofertas (offers.json). Sin dependencias.

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const str = (x) => (typeof x === 'string' ? x.trim() : '');

/** Normaliza una oferta o devuelve { error }. */
export function normalizeOffer(o, index = 0) {
  if (!o || typeof o !== 'object') return { error: `Oferta ${index + 1}: no es un objeto` };
  const company = str(o.company);
  const tariff = str(o.tariff);
  if (!company || !tariff) return { error: `Oferta ${index + 1}: falta company o tariff` };
  for (const k of ['energyPrice', 'powerP1', 'powerP2']) {
    if (!isNum(o[k]) || o[k] < 0 || o[k] > 2) return { error: `${company} — ${tariff}: ${k} debe ser un número entre 0 y 2 (€ sin impuestos)` };
  }
  if (o.energyPriceYear1 != null && (!isNum(o.energyPriceYear1) || o.energyPriceYear1 < 0 || o.energyPriceYear1 > 2)) return { error: `${company} — ${tariff}: energyPriceYear1 no válido` };
  const monthlyFee = o.monthlyFee == null ? 0 : o.monthlyFee;
  const lockInMonths = o.lockInMonths == null ? 0 : o.lockInMonths;
  if (!isNum(monthlyFee) || monthlyFee < 0 || monthlyFee > 100) return { error: `${company} — ${tariff}: monthlyFee no válido` };
  if (!isNum(lockInMonths) || lockInMonths < 0 || lockInMonths > 120) return { error: `${company} — ${tariff}: lockInMonths no válido` };
  const url = str(o.url);
  return {
    offer: {
      id: str(o.id) || `${company}-${tariff}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      company,
      tariff,
      kind: o.kind === 'referencia' ? 'referencia' : 'oferta',
      energyPrice: o.energyPrice,
      energyPriceYear1: o.energyPriceYear1 ?? undefined,
      powerP1: o.powerP1,
      powerP2: o.powerP2,
      monthlyFee,
      lockInMonths,
      lockInUncertain: !!o.lockInUncertain,
      priceFixedMonths: isNum(o.priceFixedMonths) ? o.priceFixedMonths : undefined,
      reviewMonths: isNum(o.reviewMonths) ? o.reviewMonths : undefined,
      ipcLinked: !!o.ipcLinked,
      maxKw: isNum(o.maxKw) ? o.maxKw : undefined,
      renewable: str(o.renewable) || 'No indicado',
      restrictions: str(o.restrictions) || str(o.notes),
      promotion: str(o.promotion),
      url: /^https?:\/\//i.test(url) ? url : '',
      urlVerified: !!o.urlVerified,
      consultedOn: /^\d{4}-\d{2}-\d{2}$/.test(str(o.consultedOn)) ? o.consultedOn : '',
      verification: str(o.verification) || 'Sin indicar',
      rating: str(o.rating),
      pros: Array.isArray(o.pros) ? o.pros.map(str).filter((x) => x && x !== '—') : [],
      cons: Array.isArray(o.cons) ? o.cons.map(str).filter((x) => x && x !== '—') : [],
      clauses: Array.isArray(o.clauses) ? o.clauses.map(str).filter((x) => x && x !== '—') : [],
    },
  };
}

/** Valida un documento { version, offers:[…], params? } entero. Devuelve { ok, doc, errors }. */
export function validateOffersDoc(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.offers)) return { ok: false, errors: ['El fichero no tiene la forma { "offers": [ … ] }'] };
  if (raw.offers.length === 0) return { ok: false, errors: ['El fichero no contiene ofertas'] };
  if (raw.offers.length > 500) return { ok: false, errors: ['Demasiadas ofertas (máximo 500)'] };
  const offers = [];
  raw.offers.forEach((o, i) => {
    const r = normalizeOffer(o, i);
    if (r.error) errors.push(r.error);
    else offers.push(r.offer);
  });
  if (errors.length) return { ok: false, errors: errors.slice(0, 8) };
  const params = {};
  if (raw.params && typeof raw.params === 'object') {
    for (const k of ['bonoSocialDia', 'alquilerEquipoDia', 'impuestoElectrico', 'iva']) if (isNum(raw.params[k])) params[k] = raw.params[k];
  }
  return { ok: true, errors: [], doc: { version: str(raw.version) || 'sin versión', description: str(raw.description), params, offers } };
}

/** Días transcurridos desde una fecha ISO hasta hoy (null si no hay fecha). */
export function ageDays(iso, today = new Date().toISOString().slice(0, 10)) {
  if (!iso) return null;
  const a = Date.parse(iso + 'T00:00:00Z');
  const b = Date.parse(today + 'T00:00:00Z');
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86400000) : null;
}
