import { DEFAULT_PARAMS, daysBetween, summarizeInvoices, simulateOffer, rankOffers } from './engine.js';
import { validateOffersDoc, ageDays } from './offers.js';
import { MAX_INVOICES, loadState, saveState, defaultState, exportUserData, importUserData, sampleInvoices } from './store.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt0 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf = (x, d = 3) => Number(x).toLocaleString('es-ES', { maximumFractionDigits: d });
const num = (x) => (x === '' || x == null || !Number.isFinite(Number(x)) ? 0 : Number(x));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const today = () => new Date().toISOString().slice(0, 10);

let state = loadState();
let bundled = null; // ofertas incluidas en la app
let loadError = '';

const save = () => saveState(state);

// ------------------------------------------------------------------ ofertas
function activeDoc() {
  return state.customOffers?.doc ?? bundled;
}
function activeOffers() {
  return activeDoc()?.offers ?? [];
}
function params() {
  const o = {};
  for (const [k, v] of Object.entries(state.settings.params || {})) if (v !== '' && v != null && Number.isFinite(Number(v))) o[k] = Number(v);
  return { ...DEFAULT_PARAMS, ...(activeDoc()?.params || {}), ...o };
}

async function loadBundled() {
  try {
    const r = await fetch('data/offers.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const v = validateOffersDoc(await r.json());
    if (!v.ok) throw new Error(v.errors.join(' · '));
    bundled = v.doc;
    loadError = '';
  } catch (e) {
    loadError = `No se pudieron cargar las ofertas incluidas (${e.message}). Abre la app desde un servidor (npm start) o importa un offers.json.`;
  }
}

function renderStatus() {
  const el = $('#offers-status');
  const d = activeDoc();
  if (!d) {
    el.textContent = loadError || 'Cargando ofertas…';
    el.className = 'status error';
    return;
  }
  const dates = d.offers.map((o) => o.consultedOn).filter(Boolean).sort();
  const oldest = dates[0];
  const newest = dates[dates.length - 1];
  const age = ageDays(newest);
  const src = state.customOffers ? `importadas el ${state.customOffers.loadedAt}` : 'incluidas en la app';
  el.className = 'status' + (age != null && age > 30 ? ' warn' : '');
  el.textContent = `${d.offers.length} ofertas (${src}) · versión ${d.version} · precios consultados entre ${oldest ?? '?'} y ${newest ?? '?'}${age != null && age > 30 ? ` — pueden estar desfasados (${age} días): pulsa «Actualizar ofertas»` : ''}`;
}

// ------------------------------------------------------------------ cálculo común
function invoicesForEngine() {
  return state.invoices.map((f) => ({
    days: num(f.days) > 0 ? num(f.days) : daysBetween(f.start, f.end),
    kw: num(f.kw),
    kwhP1: num(f.kwhP1),
    kwhP2: num(f.kwhP2),
    kwhP3: num(f.kwhP3),
    kwhTotal: num(f.kwhTotal),
    total: num(f.total),
  }));
}
function context() {
  const summary = summarizeInvoices(invoicesForEngine());
  const kw = num(state.settings.kw) || summary.avgKw;
  const base = num(state.settings.annualKwh) || summary.annualKwh;
  const annualKwh = Math.round(base * (1 + num(state.settings.variationPct) / 100));
  return { summary, kw, annualKwh };
}

// ------------------------------------------------------------------ pestaña facturas
function invoiceCard(f, i) {
  const field = (key, label, step = 'any', extra = '') => `<label>${label}<input type="number" inputmode="decimal" step="${step}" min="0" data-i="${i}" data-f="${key}" value="${esc(f[key])}" ${extra}></label>`;
  return `<div class="card" data-card="${i}">
    <div class="invoice-head"><strong>Factura ${i + 1}</strong><button class="btn danger" type="button" data-del="${i}" aria-label="Eliminar factura ${i + 1}">Eliminar</button></div>
    <div class="grid">
      <label>Inicio del periodo<input type="date" data-i="${i}" data-f="start" value="${esc(f.start)}"></label>
      <label>Fin del periodo<input type="date" data-i="${i}" data-f="end" value="${esc(f.end)}"></label>
      ${field('days', 'Días', '1')}
      ${field('kw', 'Potencia contratada (kW)')}
      ${field('kwhP1', 'kWh P1 (punta)')}
      ${field('kwhP2', 'kWh P2 (llano)')}
      ${field('kwhP3', 'kWh P3 (valle)')}
      ${field('kwhTotal', 'kWh total (si no hay desglose)')}
      ${field('total', 'Importe factura (€, opcional)')}
    </div>
  </div>`;
}

function renderFacturas() {
  const el = $('#tab-facturas');
  el.innerHTML = `
    <p class="muted">Escribe los datos de tus últimas facturas (hasta ${MAX_INVOICES}). Se guardan solo en este dispositivo. Si tu factura no desglosa P1/P2/P3, usa «kWh total».</p>
    <div id="inv-summary" class="summary" aria-live="polite"></div>
    <div id="inv-list">${state.invoices.map(invoiceCard).join('')}</div>
    <div class="row">
      <button id="add-inv" class="btn primary" type="button" ${state.invoices.length >= MAX_INVOICES ? 'disabled' : ''}>Añadir factura (${state.invoices.length}/${MAX_INVOICES})</button>
      <button id="load-sample" class="btn" type="button">Cargar datos de ejemplo</button>
    </div>
    <p class="muted">Los datos de ejemplo son ficticios.</p>`;
  updateInvoiceSummary();
}

function updateInvoiceSummary() {
  const box = $('#inv-summary');
  if (!box) return;
  const { summary, kw, annualKwh } = context();
  const partial = summary.days > 0 && summary.days < 330;
  box.innerHTML = `
    <div><b>${summary.count}</b><span>facturas válidas</span></div>
    <div><b>${nf(summary.days, 0)}</b><span>días cubiertos${partial ? ' (se proyecta a 365)' : ''}</span></div>
    <div><b>${nf(summary.kwh, 0)} kWh</b><span>consumo en esos días</span></div>
    <div><b>${nf(annualKwh, 0)} kWh</b><span>consumo anual estimado</span></div>
    <div><b>${nf(kw, 2)} kW</b><span>potencia</span></div>
    ${summary.paidAnnualized != null ? `<div><b>${fmt0.format(summary.paidAnnualized)}</b><span>pagado, anualizado</span></div>` : ''}`;
}

function onInvoiceInput(e) {
  const t = e.target;
  if (!(t instanceof HTMLInputElement) || t.dataset.f == null) return;
  const i = Number(t.dataset.i);
  const f = state.invoices[i];
  if (!f) return;
  f[t.dataset.f] = t.type === 'date' ? t.value : t.value === '' ? '' : Number(t.value);
  if (t.dataset.f === 'start' || t.dataset.f === 'end') {
    const d = daysBetween(f.start, f.end);
    if (d > 0) {
      f.days = d;
      const di = $(`[data-i="${i}"][data-f="days"]`);
      if (di) di.value = d;
    }
  }
  save();
  updateInvoiceSummary();
}

function onFacturasClick(e) {
  const del = e.target.closest('[data-del]');
  if (del) {
    state.invoices.splice(Number(del.dataset.del), 1);
    save();
    renderFacturas();
    return;
  }
  if (e.target.closest('#add-inv') && state.invoices.length < MAX_INVOICES) {
    const last = state.invoices[state.invoices.length - 1];
    state.invoices.push({ id: uid(), start: last?.end ?? '', end: '', days: '', kw: last?.kw ?? '', kwhP1: '', kwhP2: '', kwhP3: '', kwhTotal: '', total: '' });
    save();
    renderFacturas();
    $('#inv-list .card:last-child input')?.focus();
    return;
  }
  if (e.target.closest('#load-sample')) {
    if (state.invoices.length && !confirm('Se sustituirán las facturas actuales por datos de ejemplo. ¿Continuar?')) return;
    state.invoices = sampleInvoices();
    save();
    renderFacturas();
  }
}

// ------------------------------------------------------------------ pestaña condiciones
function renderCondiciones() {
  const c = state.conditions;
  const s = state.settings;
  const cur = state.current;
  const ren = state.renewal;
  const check = (key, title, hint) => `<label class="check"><input type="checkbox" data-cond="${key}" ${c[key] ? 'checked' : ''}><span>${title}<small>${hint}</small></span></label>`;
  const price = (obj, key, label, step = 'any') => `<label>${label}<input type="number" inputmode="decimal" step="${step}" min="0" data-obj="${obj}" data-k="${key}" value="${esc(state[obj][key])}"></label>`;
  $('#tab-condiciones').innerHTML = `
    <h2>Qué buscas</h2>
    <div class="card">
      ${check('renewableOnly', 'Solo energía 100 % renovable', 'Solo ofertas que lo declaran.')}
      ${check('noLockIn', 'Sin permanencia', 'Excluye las que tienen permanencia o donde no está claro.')}
      ${check('noFee', 'Sin cuota fija mensual', 'Excluye las que cobran una cuota mensual aparte.')}
      ${check('fixed12', 'Precio fijo al menos 12 meses', 'Excluye las que revisan el precio antes (p. ej. cada 6 meses).')}
      ${check('noIpc', 'Sin actualización por IPC', 'Excluye las que pueden subir con el IPC.')}
      ${check('excludeUnverified', 'Solo datos confirmados', 'Oculta las ofertas con datos contradictorios entre fuentes.')}
      <p class="muted">Siempre se comparan tarifas de <strong>precio único las 24 horas</strong> (sin tener que mirar la hora de la lavadora o la cocina).</p>
      <label>Ordenar por
        <select data-basis>
          <option value="year1" ${c.basis === 'year1' ? 'selected' : ''}>Coste del primer año (con descuentos de bienvenida)</option>
          <option value="steady" ${c.basis === 'steady' ? 'selected' : ''}>Coste a partir del segundo año (sin descuentos)</option>
        </select>
      </label>
    </div>

    <h2>Potencia y consumo</h2>
    <div class="card grid">
      <label>Potencia contratada (kW)<input type="number" inputmode="decimal" step="any" min="0" data-set="kw" value="${esc(s.kw)}" placeholder="usar la de las facturas"></label>
      <label>Consumo anual (kWh)<input type="number" inputmode="decimal" step="any" min="0" data-set="annualKwh" value="${esc(s.annualKwh)}" placeholder="usar el de las facturas"></label>
      <label>Variación de consumo (%)<input type="number" inputmode="decimal" step="any" data-set="variationPct" value="${esc(s.variationPct)}"></label>
    </div>
    <p class="muted">Deja vacíos potencia y consumo para usar los de tus facturas. Con la variación puedes probar «¿y si consumo un 10 % más?».</p>

    <h2>Tu tarifa actual (opcional)</h2>
    <div class="card">
      <p class="muted">Precios SIN impuestos tal como aparecen en tu factura o contrato. Sirven para decirte cuánto ahorras o pierdes.</p>
      <div class="grid">
        ${price('current', 'energyPrice', 'Energía (€/kWh)')}
        ${price('current', 'powerP1', 'Potencia punta P1 (€/kW/día)')}
        ${price('current', 'powerP2', 'Potencia valle P2 (€/kW/día)')}
        ${price('current', 'monthlyFee', 'Cuota fija (€/mes)')}
      </div>
    </div>
    <h2>Renovación que te han comunicado (opcional)</h2>
    <div class="card">
      <div class="grid">
        ${price('renewal', 'energyPrice', 'Energía (€/kWh)')}
        ${price('renewal', 'powerP1', 'Potencia punta P1 (€/kW/día)')}
        ${price('renewal', 'powerP2', 'Potencia valle P2 (€/kW/día)')}
        ${price('renewal', 'monthlyFee', 'Cuota fija (€/mes)')}
      </div>
    </div>`;
}

function onCondInput(e) {
  const t = e.target;
  if (t.dataset.cond) state.conditions[t.dataset.cond] = t.checked;
  else if (t.dataset.basis != null) state.conditions.basis = t.value;
  else if (t.dataset.set) state.settings[t.dataset.set] = t.value === '' ? '' : Number(t.value);
  else if (t.dataset.obj) state[t.dataset.obj][t.dataset.k] = t.value === '' ? '' : Number(t.value);
  else return;
  save();
}

// ------------------------------------------------------------------ pestaña resultados
const chip = (text, cls = '') => `<span class="chip ${cls}">${esc(text)}</span>`;

function offerChips(o) {
  const out = [];
  if (o.lockInMonths > 0) out.push(chip(`Permanencia ${o.lockInMonths} meses`, 'bad'));
  else if (o.lockInUncertain) out.push(chip('Permanencia por confirmar', 'warn'));
  else out.push(chip('Sin permanencia', 'good'));
  if (/^s[ií]/i.test(o.renewable)) out.push(chip('Renovable', 'good'));
  if (/confirmar/i.test(o.verification)) out.push(chip('Datos por confirmar', 'warn'));
  else if (/^(web oficial|facturas|carta)/i.test(o.verification)) out.push(chip('Web oficial', 'good'));
  else out.push(chip('Fuente secundaria'));
  if (o.energyPriceYear1 != null && o.energyPriceYear1 < o.energyPrice) out.push(chip('Dto. solo 1.er año', 'warn'));
  if (o.monthlyFee > 0) out.push(chip(`Cuota ${nf(o.monthlyFee, 2)} €/mes`, 'warn'));
  if (o.reviewMonths && o.reviewMonths < 12) out.push(chip(`Revisión cada ${o.reviewMonths} meses`, 'warn'));
  if (o.ipcLinked) out.push(chip('Ligada al IPC', 'warn'));
  if (o.maxKw) out.push(chip(`Hasta ${o.maxKw} kW`));
  const age = ageDays(o.consultedOn);
  if (age != null && age > 30) out.push(chip(`Precio de hace ${age} días`, 'warn'));
  return out.join('');
}

function delta(label, diff) {
  if (diff == null) return '';
  const cls = diff > 0 ? 'good' : diff < 0 ? 'bad' : '';
  const txt = diff > 0 ? `ahorras ${fmt0.format(diff)}/año` : diff < 0 ? `pagas ${fmt0.format(-diff)}/año más` : 'igual';
  return `<div class="delta ${cls}">${label}: ${txt}</div>`;
}

function refCost(obj, ctx, p) {
  const o = state[obj];
  if (!(num(o.energyPrice) > 0 && (num(o.powerP1) > 0 || num(o.powerP2) > 0)) || !(ctx.annualKwh > 0)) return null;
  return simulateOffer({ energyPrice: num(o.energyPrice), powerP1: num(o.powerP1), powerP2: num(o.powerP2), monthlyFee: num(o.monthlyFee) }, ctx, p).steady.total;
}

function renderResultados() {
  const el = $('#tab-resultados');
  const offers = activeOffers();
  const ctx = context();
  if (!offers.length) {
    el.innerHTML = `<p class="status error">${esc(loadError || 'No hay ofertas cargadas. Pulsa «Actualizar ofertas».')}</p>`;
    return;
  }
  if (!(ctx.annualKwh > 0) || !(ctx.kw > 0)) {
    el.innerHTML = `<div class="card"><p>Primero introduce al menos una factura en <strong>Mis facturas</strong> (periodo, kW y kWh) o indica potencia y consumo anual en <strong>Condiciones</strong>.</p></div>`;
    return;
  }
  const p = params();
  const { rows } = rankOffers(offers, invoicesForEngine(), { kw: ctx.kw, annualKwh: ctx.annualKwh, conditions: state.conditions }, p);
  const key = state.conditions.basis === 'steady' ? 'steady' : 'year1';
  rows.sort((a, b) => a[key].total - b[key].total);
  const cur = refCost('current', { kw: ctx.kw, annualKwh: ctx.annualKwh }, p);
  const ren = refCost('renewal', { kw: ctx.kw, annualKwh: ctx.annualKwh }, p);
  const total = offers.filter((o) => o.kind !== 'referencia').length;

  const head = `<div class="summary">
    <div><b>${nf(ctx.annualKwh, 0)} kWh</b><span>consumo anual</span></div>
    <div><b>${nf(ctx.kw, 2)} kW</b><span>potencia</span></div>
    ${cur != null ? `<div><b>${fmt0.format(cur)}</b><span>tu tarifa actual (modelo)</span></div>` : ''}
    ${ren != null ? `<div><b>${fmt0.format(ren)}</b><span>si renuevas</span></div>` : ''}
    ${ctx.summary.paidAnnualized != null ? `<div><b>${fmt0.format(ctx.summary.paidAnnualized)}</b><span>pagado (facturas, anualizado)</span></div>` : ''}
  </div>
  <p class="muted">${rows.length} de ${total} ofertas cumplen tus condiciones. Costes anuales con impuestos (IVA ${nf(p.iva * 100, 1)} %, impuesto eléctrico ${nf(p.impuestoElectrico * 100, 2)} %) y costes regulados incluidos. Ordenado por ${key === 'year1' ? 'primer año' : 'segundo año en adelante'}.</p>`;

  const cards = rows
    .map((r, i) => {
      const o = r.offer;
      const c = r[key];
      const bd = c;
      return `<div class="card"><div class="result">
        <div class="pos">${i + 1}</div>
        <div>
          <strong>${esc(o.company)}</strong><div class="muted">${esc(o.tariff)}</div>
          <div class="chips">${offerChips(o)}</div>
          ${delta('vs tu tarifa actual', cur != null ? cur - c.total : null)}
          ${delta('vs renovación', ren != null ? ren - c.total : null)}
        </div>
        <div class="price"><b>${fmt0.format(c.total)}</b><span class="muted">${fmt2.format(c.total / 12)} /mes</span>
          ${key === 'year1' && r.steady.total !== r.year1.total ? `<div class="muted">año 2+: ${fmt0.format(r.steady.total)}</div>` : ''}</div>
      </div>
      <details><summary>Desglose y condiciones</summary>
        <table><tbody>
          <tr><td>Potencia</td><td>${fmt2.format(bd.power)}</td></tr>
          <tr><td>Energía</td><td>${fmt2.format(bd.energy)}</td></tr>
          ${bd.fee ? `<tr><td>Cuota fija</td><td>${fmt2.format(bd.fee)}</td></tr>` : ''}
          <tr><td>Bono social y contador (regulados)</td><td>${fmt2.format(bd.regulated)}</td></tr>
          <tr><td>Impuesto eléctrico</td><td>${fmt2.format(bd.ie)}</td></tr>
          <tr><td>IVA</td><td>${fmt2.format(bd.vat)}</td></tr>
          <tr><th>Total anual</th><th>${fmt2.format(bd.total)}</th></tr>
        </tbody></table>
        <p class="muted">Energía ${nf(o.energyPrice)} €/kWh${o.energyPriceYear1 != null ? ` (1.er año ${nf(o.energyPriceYear1)})` : ''} · potencia ${nf(o.powerP1)} / ${nf(o.powerP2)} €/kW/día · sin impuestos.</p>
        ${o.restrictions ? `<p>${esc(o.restrictions)}</p>` : ''}
        ${o.promotion ? `<p class="muted">Promoción (no incluida): ${esc(o.promotion)}</p>` : ''}
        ${o.clauses.length ? `<p><strong>Vigila:</strong> ${o.clauses.map(esc).join(' · ')}</p>` : ''}
        ${o.rating ? `<p class="muted">Opiniones: ${esc(o.rating)}</p>` : ''}
        <p class="muted">${esc(o.verification)}${o.consultedOn ? ` · consultado el ${esc(o.consultedOn)}` : ''}${o.url ? ` · <a href="${esc(o.url)}" target="_blank" rel="noopener noreferrer">web</a>` : ''}</p>
      </details></div>`;
    })
    .join('');
  el.innerHTML = head + (cards || '<div class="card"><p>Ninguna oferta cumple todas tus condiciones. Relaja alguna en <strong>Condiciones</strong>.</p></div>') +
    '<p class="muted">Los precios son los publicados en la fecha indicada y pueden haber cambiado: confirma precio, duración y permanencia en la web oficial antes de contratar.</p>';
}

// ------------------------------------------------------------------ pestaña ofertas
function renderOfertas() {
  const offers = activeOffers().filter((o) => o.kind !== 'referencia').slice().sort((a, b) => a.company.localeCompare(b.company, 'es'));
  $('#tab-ofertas').innerHTML = offers.length
    ? `<p class="muted">${offers.length} ofertas cargadas (precios sin impuestos).</p>` +
      offers
        .map(
          (o) => `<div class="card"><strong>${esc(o.company)}</strong> <span class="muted">— ${esc(o.tariff)}</span>
        <div class="chips">${offerChips(o)}</div>
        <p class="muted">Energía ${nf(o.energyPrice)} €/kWh · potencia ${nf(o.powerP1)} / ${nf(o.powerP2)} €/kW/día${o.monthlyFee ? ` · cuota ${nf(o.monthlyFee, 2)} €/mes` : ''}</p>
        ${o.restrictions ? `<p>${esc(o.restrictions)}</p>` : ''}
        <p class="muted">${esc(o.verification)}${o.consultedOn ? ` · ${esc(o.consultedOn)}` : ''}${o.url ? ` · <a href="${esc(o.url)}" target="_blank" rel="noopener noreferrer">web</a>` : ''}</p></div>`,
        )
        .join('')
    : `<p class="status error">${esc(loadError || 'Sin ofertas.')}</p>`;
}

// ------------------------------------------------------------------ pestaña ajustes
function renderAjustes() {
  const p = state.settings.params || {};
  const eff = params();
  const pv = (k, label, step, scale = 1) => `<label>${label}<input type="number" inputmode="decimal" step="${step}" min="0" data-par="${k}" data-scale="${scale}" value="${p[k] === '' || p[k] == null ? '' : esc(p[k] * scale)}" placeholder="${nf(eff[k] * scale, 6)}"></label>`;
  $('#tab-ajustes').innerHTML = `
    <h2>Impuestos y costes regulados</h2>
    <div class="card grid">
      ${pv('iva', 'IVA (%)', 'any', 100)}
      ${pv('impuestoElectrico', 'Impuesto eléctrico (%)', 'any', 100)}
      ${pv('bonoSocialDia', 'Bono social (€/día)', 'any')}
      ${pv('alquilerEquipoDia', 'Alquiler contador (€/día)', 'any')}
    </div>
    <p class="muted">Vacío = valor por defecto (el mostrado). Cámbialos si hay IVA reducido u otros cambios.</p>
    <h2>Tus datos</h2>
    <div class="card">
      <p class="muted">Todo se guarda solo en este dispositivo. Puedes pasar tus datos a otro con exportar/importar.</p>
      <div class="row">
        <button id="exp" class="btn" type="button">Exportar mis datos</button>
        <label class="btn" for="imp">Importar datos…</label><input id="imp" type="file" accept="application/json,.json" hidden>
        <button id="wipe" class="btn danger" type="button">Borrar todo</button>
      </div>
      <p id="data-msg" class="status" role="status"></p>
    </div>
    <h2>Acerca de</h2>
    <p class="muted">Compara tarifas 2.0TD de precio único. Costes = potencia × días × (P1+P2) + energía + cuota + costes regulados + impuesto eléctrico + IVA. Las ofertas son datos publicados por las comercializadoras en la fecha indicada; no es una oferta ni un asesoramiento. Esta herramienta no se conecta a ninguna web por sí sola: «Actualizar ofertas» solo descarga el fichero de ofertas que le indiques.</p>`;
}

function onAjustesInput(e) {
  const t = e.target;
  if (t.dataset.par) {
    state.settings.params[t.dataset.par] = t.value === '' ? '' : Number(t.value) / Number(t.dataset.scale || 1);
    save();
  }
}

function dataMsg(text, cls = '') {
  const m = $('#data-msg');
  if (m) {
    m.textContent = text;
    m.className = 'status ' + cls;
  }
}

function onAjustesClick(e) {
  if (e.target.closest('#exp')) {
    const blob = new Blob([exportUserData(state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tarifas-luz-datos-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    dataMsg('Datos exportados.');
  } else if (e.target.closest('#wipe')) {
    if (confirm('¿Borrar facturas, condiciones y ajustes de este dispositivo?')) {
      const keep = state.customOffers;
      state = { ...defaultState(), customOffers: keep };
      save();
      renderAll();
      dataMsg('Datos borrados.');
    }
  }
}

async function onImportFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    state = importUserData(await file.text(), state);
    save();
    renderAll();
    dataMsg(`Datos importados: ${state.invoices.length} facturas.`);
  } catch (err) {
    dataMsg(err.message, 'error');
  }
  e.target.value = '';
}

// ------------------------------------------------------------------ actualizar ofertas
const dlg = $('#dlg-update');
function updMsg(text, cls = '') {
  const m = $('#upd-msg');
  m.textContent = text;
  m.className = 'status ' + cls;
}
function applyOffersText(text, source) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    updMsg('El fichero no es un JSON válido.', 'error');
    return false;
  }
  const v = validateOffersDoc(raw);
  if (!v.ok) {
    updMsg('Fichero rechazado: ' + v.errors.join(' · '), 'error');
    return false;
  }
  state.customOffers = { doc: v.doc, loadedAt: today(), source };
  save();
  renderStatus();
  renderAll();
  updMsg(`Cargadas ${v.doc.offers.length} ofertas (versión ${v.doc.version}).`);
  return true;
}
async function fetchOffers() {
  const url = $('#upd-url').value.trim();
  if (url && !/^https:\/\//i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(url)) {
    updMsg('Por seguridad solo se aceptan direcciones https:// (o localhost).', 'error');
    return;
  }
  state.settings.offersUrl = url;
  save();
  updMsg('Descargando…');
  try {
    const r = await fetch(url || `data/offers.json?ts=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    if (text.length > 5_000_000) throw new Error('fichero demasiado grande');
    if (!url) {
      // ofertas incluidas: se refrescan sin marcarlas como importadas
      const v = validateOffersDoc(JSON.parse(text));
      if (!v.ok) throw new Error(v.errors.join(' · '));
      bundled = v.doc;
      state.customOffers = null;
      save();
      renderStatus();
      renderAll();
      updMsg(`Ofertas incluidas recargadas (${v.doc.offers.length}, versión ${v.doc.version}).`);
    } else {
      applyOffersText(text, url);
    }
  } catch (err) {
    updMsg(`No se pudo descargar (${err.message}). Sin conexión o la dirección no permite lectura desde el navegador: usa «Importar archivo».`, 'error');
  }
}

// ------------------------------------------------------------------ tabs y arranque
const renderers = { facturas: renderFacturas, condiciones: renderCondiciones, resultados: renderResultados, ofertas: renderOfertas, ajustes: renderAjustes };
let currentTab = 'facturas';

function showTab(name) {
  if (!renderers[name]) name = 'facturas';
  currentTab = name;
  for (const b of document.querySelectorAll('.tabs [role="tab"]')) {
    b.setAttribute('aria-selected', String(b.dataset.tab === name));
    if (b.dataset.tab === name) b.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }
  for (const k of Object.keys(renderers)) $(`#tab-${k}`).hidden = k !== name;
  renderers[name]();
  try {
    history.replaceState(null, '', `#${name}`);
  } catch {
    /* sin historial (file://) */
  }
}
function renderAll() {
  renderStatus();
  renderers[currentTab]();
}

function init() {
  $('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[role="tab"]');
    if (b) showTab(b.dataset.tab);
  });
  const f = $('#tab-facturas');
  f.addEventListener('input', onInvoiceInput);
  f.addEventListener('click', onFacturasClick);
  const c = $('#tab-condiciones');
  c.addEventListener('input', onCondInput);
  c.addEventListener('change', onCondInput);
  const a = $('#tab-ajustes');
  a.addEventListener('input', onAjustesInput);
  a.addEventListener('click', onAjustesClick);
  a.addEventListener('change', (e) => {
    if (e.target.id === 'imp') onImportFile(e);
  });
  $('#btn-update').addEventListener('click', () => {
    $('#upd-url').value = state.settings.offersUrl || '';
    updMsg('');
    dlg.showModal();
  });
  $('#upd-fetch').addEventListener('click', fetchOffers);
  $('#upd-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) applyOffersText(await file.text(), `archivo ${file.name}`);
    e.target.value = '';
  });
  $('#upd-reset').addEventListener('click', () => {
    state.customOffers = null;
    save();
    renderAll();
    updMsg('Se usan de nuevo las ofertas incluidas en la app.');
  });
  loadBundled().then(() => {
    renderAll();
  });
  const start = (location.hash || '').replace('#', '');
  showTab(renderers[start] ? start : 'facturas');
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
