// Motor de cálculo compartido (navegador y Node). Sin dependencias.
// Importes en euros. Todos los precios de oferta son SIN impuestos y para tarifa 2.0TD.

export const DEFAULT_PARAMS = Object.freeze({
  bonoSocialDia: 0.024688, // €/día, financiación del bono social (regulado, igual para todas)
  alquilerEquipoDia: 0.0267, // €/día, alquiler del contador (regulado por distribuidora)
  impuestoElectrico: 0.0511269632, // sobre potencia + energía
  iva: 0.21,
});

const r2 = (x) => Math.round(x * 100 + 1e-9) / 100;
const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);

/** Días entre dos fechas ISO (yyyy-mm-dd), contando el día de inicio y excluyendo el de fin (criterio de factura). */
export function daysBetween(startIso, endIso) {
  const a = Date.parse(startIso + 'T00:00:00Z');
  const b = Date.parse(endIso + 'T00:00:00Z');
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.round((b - a) / 86400000);
}

/**
 * Resume las facturas introducidas.
 * invoice = { days, kw, kwhP1, kwhP2, kwhP3, kwhTotal?, total? }
 * Si falta el desglose P1/P2/P3 se usa kwhTotal.
 */
export function summarizeInvoices(invoices) {
  const valid = (invoices || []).filter((f) => num(f.days) > 0 && (num(f.kwhTotal) > 0 || num(f.kwhP1) + num(f.kwhP2) + num(f.kwhP3) > 0));
  let days = 0;
  let kwh = 0;
  let p1 = 0;
  let p2 = 0;
  let p3 = 0;
  let kwDays = 0;
  let paid = 0;
  let paidDays = 0;
  for (const f of valid) {
    const split = num(f.kwhP1) + num(f.kwhP2) + num(f.kwhP3);
    const total = split > 0 ? split : num(f.kwhTotal);
    days += num(f.days);
    kwh += total;
    p1 += num(f.kwhP1);
    p2 += num(f.kwhP2);
    p3 += num(f.kwhP3);
    kwDays += num(f.kw) * num(f.days);
    if (num(f.total) > 0) {
      paid += num(f.total);
      paidDays += num(f.days);
    }
  }
  const kwhPerDay = days > 0 ? kwh / days : 0;
  return {
    count: valid.length,
    days,
    kwh: r2(kwh),
    kwhPerDay,
    annualKwh: Math.round(kwhPerDay * 365),
    annualP1: days > 0 ? Math.round((p1 / days) * 365) : 0,
    annualP2: days > 0 ? Math.round((p2 / days) * 365) : 0,
    annualP3: days > 0 ? Math.round((p3 / days) * 365) : 0,
    avgKw: days > 0 ? kwDays / days : 0,
    paidAnnualized: paidDays > 0 ? r2((paid / paidDays) * 365) : null,
    paidTotal: r2(paid),
    paidDays,
  };
}

/** Coste de un periodo (por defecto 365 días) con los precios dados. */
export function costFor({ kw, kwh, days = 365, energyPrice, powerP1, powerP2, monthlyFee = 0 }, params = DEFAULT_PARAMS) {
  const power = num(kw) * days * (num(powerP1) + num(powerP2));
  const energy = num(kwh) * num(energyPrice);
  const fee = (num(monthlyFee) * 12 * days) / 365;
  const regulated = (num(params.bonoSocialDia) + num(params.alquilerEquipoDia)) * days;
  const ie = (power + energy) * num(params.impuestoElectrico);
  const base = power + energy + fee + regulated + ie;
  const vat = base * num(params.iva);
  const total = base + vat;
  return {
    power: r2(power),
    energy: r2(energy),
    fee: r2(fee),
    regulated: r2(regulated),
    ie: r2(ie),
    vat: r2(vat),
    total: r2(total),
  };
}

/** Pasa por el motor una oferta: año 1 (con descuentos de bienvenida) y año 2 en adelante. */
export function simulateOffer(offer, ctx, params = DEFAULT_PARAMS) {
  const common = { kw: ctx.kw, kwh: ctx.annualKwh, days: 365, powerP1: offer.powerP1, powerP2: offer.powerP2, monthlyFee: offer.monthlyFee };
  const year1 = costFor({ ...common, energyPrice: offer.energyPriceYear1 ?? offer.energyPrice }, params);
  const steady = costFor({ ...common, energyPrice: offer.energyPrice }, params);
  return { year1, steady, monthlyYear1: r2(year1.total / 12), monthlySteady: r2(steady.total / 12) };
}

/** Filtros de condiciones del usuario. */
export function matchesConditions(offer, cond = {}) {
  if (cond.renewableOnly && !/^s[ií]/i.test(offer.renewable || '')) return false;
  if (cond.noLockIn && (num(offer.lockInMonths) > 0 || offer.lockInUncertain)) return false;
  if (cond.noFee && num(offer.monthlyFee) > 0) return false;
  if (cond.fixed12 && (num(offer.reviewMonths) > 0 && num(offer.reviewMonths) < 12)) return false;
  if (cond.noIpc && offer.ipcLinked) return false;
  if (cond.excludeUnverified && /confirmar/i.test(offer.verification || '')) return false;
  if (cond.maxKw && offer.maxKw && num(cond.kw) > num(offer.maxKw)) return false;
  return true;
}

/** Simula todas las ofertas y devuelve la lista ordenada por coste del primer año. */
export function rankOffers(offers, invoices, options = {}, params = DEFAULT_PARAMS) {
  const sum = summarizeInvoices(invoices);
  const kw = num(options.kw) || sum.avgKw;
  const ctx = { kw, annualKwh: num(options.annualKwh) || sum.annualKwh };
  const rows = offers
    .filter((o) => o.kind !== 'referencia')
    .filter((o) => matchesConditions(o, { ...options.conditions, kw }))
    .map((o) => ({ offer: o, ...simulateOffer(o, ctx, params) }));
  rows.sort((a, b) => a.year1.total - b.year1.total);
  return { summary: sum, ctx, rows };
}
