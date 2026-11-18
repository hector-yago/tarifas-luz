import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateOffersDoc, normalizeOffer, ageDays } from '../js/offers.js';

const doc = JSON.parse(readFileSync(new URL('../data/offers.json', import.meta.url), 'utf8'));

test('el fichero de ofertas incluido es válido y completo', () => {
  const v = validateOffersDoc(doc);
  assert.equal(v.ok, true, v.errors.join('; '));
  assert.ok(v.doc.offers.length >= 29);
  assert.ok(v.doc.params.iva === 0.21);
});

test('rechaza documentos sin ofertas o con precios absurdos', () => {
  assert.equal(validateOffersDoc(null).ok, false);
  assert.equal(validateOffersDoc({ offers: [] }).ok, false);
  const bad = validateOffersDoc({ offers: [{ company: 'X', tariff: 'Y', energyPrice: 15, powerP1: 0.1, powerP2: 0.1 }] });
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0], /energyPrice/);
  assert.equal(validateOffersDoc({ offers: [{ company: '', tariff: 'Y', energyPrice: 0.1, powerP1: 0.1, powerP2: 0.1 }] }).ok, false);
});

test('normaliza valores por defecto y descarta URLs no http(s)', () => {
  const r = normalizeOffer({ company: 'A', tariff: 'B', energyPrice: 0.12, powerP1: 0.09, powerP2: 0.09, url: 'javascript:alert(1)' });
  assert.equal(r.offer.url, '');
  assert.equal(r.offer.monthlyFee, 0);
  assert.equal(r.offer.lockInMonths, 0);
  assert.equal(r.offer.renewable, 'No indicado');
});

test('ageDays', () => {
  assert.equal(ageDays('2026-11-01', '2026-11-18'), 17);
  assert.equal(ageDays('', '2026-11-18'), null);
});
