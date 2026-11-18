import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, exportUserData, importUserData, sampleInvoices, loadState, saveState, MAX_INVOICES } from '../js/store.js';

test('exportar e importar conserva facturas y condiciones y no arrastra las ofertas descargadas', () => {
  const s = defaultState();
  s.invoices = sampleInvoices();
  s.conditions.renewableOnly = true;
  s.customOffers = { doc: { offers: [] } };
  const text = exportUserData(s);
  assert.ok(!text.includes('customOffers'));
  const back = importUserData(text, defaultState());
  assert.equal(back.invoices.length, 6);
  assert.equal(back.conditions.renewableOnly, true);
  assert.equal(back.invoices[0].kw, 4.4);
});

test('importar rechaza ficheros ajenos y JSON roto', () => {
  assert.throws(() => importUserData('no json', defaultState()), /JSON válido/);
  assert.throws(() => importUserData('{"a":1}', defaultState()), /exportado por esta aplicación/);
});

test('importar limita a 12 facturas y sanea números', () => {
  const many = { app: 'tarifas-luz', invoices: Array.from({ length: 20 }, (_, i) => ({ start: '2026-01-01', end: '2026-01-31', kw: 'abc', kwhP1: '5', total: null })) };
  const s = importUserData(JSON.stringify(many), defaultState());
  assert.equal(s.invoices.length, MAX_INVOICES);
  assert.equal(s.invoices[0].kw, '');
  assert.equal(s.invoices[0].kwhP1, 5);
});

test('sin localStorage (Node) load/save no lanzan y mantienen los datos en memoria', () => {
  const s = defaultState();
  s.invoices = sampleInvoices().slice(0, 2);
  saveState(s);
  assert.equal(loadState().invoices.length, 2);
});
