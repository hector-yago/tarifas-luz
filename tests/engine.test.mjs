// Pruebas del motor de cálculo contra las facturas reales de Octopus (fixture en tests/fixtures).
// Ejecutar: node --test tests
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { costFor, summarizeInvoices, simulateOffer, rankOffers, matchesConditions, DEFAULT_PARAMS } from '../js/engine.js';

// El fixture con facturas reales es privado (no se versiona): sin él, las pruebas que lo usan se omiten.
const fxUrl = new URL('./fixtures/facturas.json', import.meta.url);
const hasFx = existsSync(fxUrl);
const skip = hasFx ? false : 'falta tests/fixtures/facturas.json (datos privados)';
const fx = hasFx ? JSON.parse(readFileSync(fxUrl, 'utf8')) : { facturas: [] };
const ofertas = JSON.parse(readFileSync(new URL('../data/offers.json', import.meta.url), 'utf8'));
const actual = ofertas.offers.find((o) => o.id === 'octopus-actual');

test('reproduce cada factura de Octopus con IVA/IE generales dentro del 1 %', { skip }, () => {
  const generales = fx.facturas.filter((f) => f.tipoIVA === 0.21 && f.fin >= '2026-05-01');
  assert.ok(generales.length >= 6);
  for (const f of generales) {
    const c = costFor(
      { kw: f.potenciaKw, kwh: f.kwhTotal, days: f.dias, energyPrice: actual.energyPrice, powerP1: actual.powerP1, powerP2: actual.powerP2 },
      { ...DEFAULT_PARAMS },
    );
    const err = Math.abs(c.total - f.totalFactura) / f.totalFactura;
    assert.ok(err < 0.01, `${f.fin}: calculado ${c.total} vs factura ${f.totalFactura} (error ${(err * 100).toFixed(2)} %)`);
  }
});

test('resumen de facturas: 12 periodos, 320 días y consumo anualizado ≈1.966 kWh', { skip }, () => {
  const inv = fx.facturas.map((f) => ({ days: f.dias, kw: f.potenciaKw, kwhP1: f.kwhP1, kwhP2: f.kwhP2, kwhP3: f.kwhP3, total: f.totalFactura }));
  const s = summarizeInvoices(inv);
  assert.equal(s.count, 12);
  assert.equal(s.days, 320);
  assert.equal(s.kwh, 1724);
  assert.equal(s.annualKwh, 1966);
  assert.ok(Math.abs(s.avgKw - 3.45) < 1e-9);
});

test('la renovación de Octopus cuesta más que la tarifa actual (≈+270 €/año)', () => {
  const ctx = { kw: 3.45, annualKwh: 1966 };
  const a = simulateOffer(actual, ctx).steady.total;
  const r = simulateOffer(ofertas.offers.find((o) => o.id === 'octopus-renovacion'), ctx).steady.total;
  assert.ok(r - a > 250 && r - a < 300, `diferencia ${r - a}`);
});

test('el descuento del primer año reduce el coste del año 1 y no el posterior', () => {
  const ctx = { kw: 3.45, annualKwh: 1966 };
  const imagina = ofertas.offers.find((o) => o.id === 'imagina-sin-horas');
  const s = simulateOffer(imagina, ctx);
  assert.ok(s.year1.total < s.steady.total);
});

test('filtros: sin permanencia excluye las dudosas y renovable solo deja las que lo declaran', () => {
  const sin = ofertas.offers.filter((o) => matchesConditions(o, { noLockIn: true }));
  assert.ok(sin.every((o) => !o.lockInUncertain && !(o.lockInMonths > 0)));
  const ren = ofertas.offers.filter((o) => matchesConditions(o, { renewableOnly: true }));
  assert.ok(ren.length > 0 && ren.every((o) => /^s[ií]/i.test(o.renewable)));
  assert.equal(matchesConditions({ lockInMonths: 0, energyPrice: 0.1, renewable: 'Sí' }, { noLockIn: true, renewableOnly: true }), true);
});

test('ranking: ordenado por coste del primer año y sin filas de referencia', { skip }, () => {
  const inv = fx.facturas.map((f) => ({ days: f.dias, kw: f.potenciaKw, kwhP1: f.kwhP1, kwhP2: f.kwhP2, kwhP3: f.kwhP3 }));
  const { rows } = rankOffers(ofertas.offers, inv, {});
  assert.ok(rows.length >= 25);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].year1.total <= rows[i].year1.total);
  assert.ok(rows.every((r) => r.offer.kind !== 'referencia'));
});
