// ── API helpers ───────────────────────────────────────────────────────────────
const api = {
  get:  (url)      => fetch(url).then(r => r.json()),
  post: (url, body) => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json()),
};

// ── State ─────────────────────────────────────────────────────────────────────
let queue        = [];
let allClientes  = [];
let allHistory   = [];
let source       = 'rx30';
let lastSynced   = null;
let settings     = {};

const TYPE_LABELS = {
  receta_lista:    { label: '💊 Receta lista',  cls: 'badge-receta' },
  vencimiento_30d: { label: '💰 Vence en 30d',  cls: 'badge-vence'  },
  vencimiento_7d:  { label: '💰 Vence en 7d',   cls: 'badge-vence'  },
  vencimiento_1d:  { label: '⚠️ Vence mañana',  cls: 'badge-vence'  },
  cumpleanos:      { label: '🎂 Cumpleaños',     cls: 'badge-cumple' },
};

const CANAL_LABELS = { whatsapp: '💬 WhatsApp', llamada: '📞 Llamada' };

const TAB_TITLES = {
  dashboard: 'Inicio — ' + new Date().toLocaleDateString('es-PR', { weekday:'long', day:'numeric', month:'long', year:'numeric' }),
  clientes:  'Clientes',
  historial: 'Historial de envíos',
  config:    'Configuración',
};

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  settings = await api.get('/api/settings');
  applySettingsToUI(settings);

  // Show network URL in sidebar footer
  const info = await api.get('/api/server-info');
  document.getElementById('network-url').textContent = `Red: http://${info.ip}:${info.port}`;
});

// ── Navigation ────────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    el.classList.add('active');
    const tab = el.dataset.tab;
    document.getElementById('tab-' + tab).classList.add('active');
    document.getElementById('topbar-title').textContent = TAB_TITLES[tab] || '';
    if (tab === 'historial') loadHistory();
  });
});

// ── Source selector ───────────────────────────────────────────────────────────
function setSource(s) {
  source = s;
  document.getElementById('src-rx30').classList.toggle('active', s === 'rx30');
  document.getElementById('src-csv').classList.toggle('active',  s === 'csv');
  // Show/hide file upload area
  document.getElementById('csv-upload-area').style.display = s === 'csv' ? 'flex' : 'none';
  queue = [];
  renderQueue([]);
  updateStats([]);
  setSyncStatus('');
}

// ── Sync ──────────────────────────────────────────────────────────────────────
async function doSync() {
  if (source === 'csv') {
    document.getElementById('csv-file-input').click();
    return;
  }
  const btn = document.getElementById('sync-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Cargando…';
  clearAlert('dash-alert');

  const result = await api.get('/api/sync-rx30');

  btn.disabled = false;
  btn.textContent = '↻ Sincronizar';

  if (!result.ok) { showAlert('dash-alert', 'error', result.error); return; }
  applyQueue(result.queue, result.patientCount, '');
}

async function handleCSVUpload(input) {
  if (!input.files.length) return;
  clearAlert('dash-alert');
  const form = new FormData();
  form.append('csv', input.files[0]);
  const result = await fetch('/api/import-csv', { method: 'POST', body: form }).then(r => r.json());
  input.value = '';
  if (!result.ok) { showAlert('dash-alert', 'error', result.error); return; }
  applyQueue(result.queue, result.patientCount, result.filename);
}

function applyQueue(q, patientCount, filename) {
  queue = q || [];
  lastSynced = new Date();
  const src = filename ? ` — ${filename}` : '';
  setSyncStatus(`✅ ${patientCount} pacientes cargados${src} · ${timeAgo(lastSynced)}`);
  renderQueue(queue);
  updateStats(queue);
  updateSendButtons();
}

function setSyncStatus(msg) {
  document.getElementById('sync-status').textContent = msg;
}

// ── Queue table ───────────────────────────────────────────────────────────────
function renderQueue(items) {
  const tbody = document.getElementById('queue-tbody');
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty"><div class="icon">✅</div><p>No hay mensajes para enviar hoy.</p></div></td></tr>`;
    document.getElementById('select-all').checked = false;
    return;
  }
  tbody.innerHTML = items.map((item, i) => {
    const t = TYPE_LABELS[item.type] || { label: item.type, cls: '' };
    const preview = escHtml((item.body || item.script || '').slice(0, 80)) + '…';
    return `<tr>
      <td><input type="checkbox" class="row-check" data-idx="${i}" onchange="onRowCheck()" /></td>
      <td class="nowrap"><strong>${escHtml(item.nombre)}</strong></td>
      <td class="nowrap text-muted">${formatPhone(item.telefono)}</td>
      <td><span class="badge ${t.cls}">${t.label}</span></td>
      <td class="text-muted" style="font-size:12px">${preview}</td>
    </tr>`;
  }).join('');
}

function toggleAll(checked) {
  document.querySelectorAll('.row-check').forEach(cb => cb.checked = checked);
  updateSendButtons();
}

function onRowCheck() {
  const all     = document.querySelectorAll('.row-check');
  const checked = document.querySelectorAll('.row-check:checked');
  document.getElementById('select-all').checked = all.length > 0 && all.length === checked.length;
  updateSendButtons();
}

function getSelectedItems() {
  return Array.from(document.querySelectorAll('.row-check:checked'))
    .map(cb => queue[parseInt(cb.dataset.idx)]);
}

function updateSendButtons() {
  const count = document.querySelectorAll('.row-check:checked').length;
  document.getElementById('btn-whatsapp').disabled = count === 0;
  document.getElementById('btn-llamar').disabled   = count === 0;
  document.getElementById('selected-count').textContent = count > 0 ? `${count} seleccionado(s)` : '';
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function updateStats(items) {
  document.getElementById('stat-recetas').textContent = items.filter(i => i.type === 'receta_lista').length;
  document.getElementById('stat-vencen').textContent  = items.filter(i => i.type.startsWith('vencimiento')).length;
  document.getElementById('stat-cumples').textContent = items.filter(i => i.type === 'cumpleanos').length;
}

// ── Send flow ─────────────────────────────────────────────────────────────────
function sendSelected(canal) {
  const items = getSelectedItems();
  if (!items.length) return;

  const canalLabel = CANAL_LABELS[canal];
  document.getElementById('modal-confirm-title').textContent = `Confirmar — ${canalLabel}`;
  document.getElementById('modal-confirm-body').textContent =
    `Estás a punto de enviar ${items.length} mensaje(s) por ${canalLabel} a ${[...new Set(items.map(i => i.nombre))].length} cliente(s). ¿Continuar?`;

  const okBtn = document.getElementById('modal-confirm-ok');
  okBtn.onclick = () => { closeModal('modal-confirm'); executeSend(items, canal); };
  openModal('modal-confirm');
}

async function executeSend(items, canal) {
  const log     = document.getElementById('progress-log');
  const bar     = document.getElementById('progress-bar');
  const label   = document.getElementById('progress-label');
  const doneBtn = document.getElementById('progress-done-btn');
  const title   = document.getElementById('progress-title');

  log.innerHTML     = '';
  bar.style.width   = '0%';
  label.textContent = `0 / ${items.length}`;
  doneBtn.disabled  = true;
  title.textContent = `Enviando por ${CANAL_LABELS[canal]}…`;
  openModal('modal-progress');

  // Open SSE stream before posting
  const evtSource = new EventSource('/api/send-progress');
  evtSource.onmessage = ({ data }) => {
    const d   = JSON.parse(data);
    const pct = Math.round((d.sent / d.total) * 100);
    bar.style.width   = pct + '%';
    label.textContent = `${d.sent} / ${d.total}`;
    const cls = d.status === 'ok' ? 'item-ok' : 'item-error';
    const ico = d.status === 'ok' ? '✅' : '❌';
    const msg = d.status === 'ok' ? escHtml(d.nombre) : `${escHtml(d.nombre)} — ${escHtml(d.error || '')}`;
    log.innerHTML += `<div class="${cls}">${ico} ${msg}</div>`;
    log.scrollTop   = log.scrollHeight;
  };

  const result = await api.post('/api/send-messages', { items, canal });
  evtSource.close();
  doneBtn.disabled  = false;
  title.textContent = `Listo — ${result.sent} enviados, ${result.failed} fallidos`;
}

// ── Clientes tab ──────────────────────────────────────────────────────────────
async function loadClientes() {
  const tbody = document.getElementById('clientes-tbody');
  tbody.innerHTML = `<tr><td colspan="6"><div class="empty"><p>Cargando…</p></div></td></tr>`;
  const result = await api.get('/api/clientes');
  if (!result.ok) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty"><p style="color:var(--red)">${escHtml(result.error)}</p></div></td></tr>`;
    return;
  }
  allClientes = result.patients || [];
  renderClientes(allClientes);
}

function filterClientes() {
  const q = document.getElementById('search-input').value.toLowerCase();
  renderClientes(q ? allClientes.filter(c =>
    c.nombre.toLowerCase().includes(q) || c.telefono.includes(q)) : allClientes);
}

function renderClientes(list) {
  const tbody = document.getElementById('clientes-tbody');
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty"><p>Sin resultados.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(c => `<tr>
    <td><strong>${escHtml(c.nombre)}</strong></td>
    <td class="nowrap text-muted">${formatPhone(c.telefono)}</td>
    <td class="text-muted">${c.fecha_nacimiento || '—'}</td>
    <td>${c.saldo ? '$' + c.saldo : '—'}</td>
    <td>${c.fecha_vencimiento || '—'}</td>
    <td>${c.receta_lista === '1' ? '<span class="badge badge-receta">✓</span>' : '—'}</td>
  </tr>`).join('');
}

// ── Historial tab ─────────────────────────────────────────────────────────────
async function loadHistory() {
  allHistory = await api.get('/api/history');
  filterHistory();
}

function filterHistory() {
  const q = document.getElementById('hist-search').value.toLowerCase();
  renderHistory(q ? allHistory.filter(h => h.nombre?.toLowerCase().includes(q)) : allHistory);
}

function renderHistory(list) {
  const tbody = document.getElementById('history-tbody');
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty"><div class="icon">📋</div><p>No hay registros.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(h => {
    const ts      = new Date(h.ts).toLocaleString('es-PR');
    const t       = TYPE_LABELS[h.tipo] || { label: h.tipo, cls: '' };
    const stBadge = h.status === 'ok'
      ? '<span class="badge badge-ok">✅ Enviado</span>'
      : `<span class="badge badge-error" title="${escHtml(h.error || '')}">❌ Error</span>`;
    return `<tr>
      <td class="text-muted nowrap" style="font-size:12px">${ts}</td>
      <td><strong>${escHtml(h.nombre || '')}</strong></td>
      <td class="text-muted nowrap">${formatPhone(h.telefono || '')}</td>
      <td><span class="badge ${t.cls}">${t.label}</span></td>
      <td>${CANAL_LABELS[h.canal] || h.canal || '—'}</td>
      <td>${stBadge}</td>
    </tr>`;
  }).join('');
}

// ── Config tab ────────────────────────────────────────────────────────────────
function applySettingsToUI(s) {
  document.getElementById('cfg-nombre').value      = s.farmacia?.nombre              || '';
  document.getElementById('cfg-telefono').value    = s.farmacia?.telefono            || '';
  document.getElementById('cfg-descuento').value   = s.farmacia?.descuento_cumpleanos || '10';
  document.getElementById('cfg-rx30-enabled').checked = !!s.rx30?.enabled;
  toggleRx30Fields();
  document.getElementById('cfg-recording-url').value = s.twilio?.recording_receta_url || '';
  document.getElementById('farmacia-name').textContent = s.farmacia?.nombre || 'Farmacia';
  document.getElementById('demo-banner').style.display = s.demo_mode ? 'block' : 'none';
  // Schedule
  const sched = s.schedule || {};
  document.getElementById('cfg-schedule-hora').value  = sched.hora  || '10:00';
  document.getElementById('cfg-schedule-canal').value = sched.canal || 'llamada';
  const dias = sched.dias || [1,2,3,4,5,6];
  document.querySelectorAll('.cfg-day').forEach(cb => {
    cb.checked = dias.includes(Number(cb.value));
  });
}

function toggleRx30Fields() {
  document.getElementById('rx30-fields').style.display =
    document.getElementById('cfg-rx30-enabled').checked ? 'block' : 'none';
}

async function testRx30() {
  const res = document.getElementById('rx30-test-result');
  res.textContent = '⏳ Probando…';
  const result = await api.get('/api/test-rx30');
  res.textContent = result.ok ? '✅ Conexión exitosa' : `❌ ${result.error}`;
}

async function saveConfig() {
  const newSettings = {
    farmacia: {
      nombre:               document.getElementById('cfg-nombre').value.trim()    || 'la farmacia',
      telefono:             document.getElementById('cfg-telefono').value.trim(),
      descuento_cumpleanos: document.getElementById('cfg-descuento').value        || '10',
    },
    rx30:   { enabled: document.getElementById('cfg-rx30-enabled').checked },
    twilio: { recording_receta_url: document.getElementById('cfg-recording-url').value.trim() },
  };
  newSettings.schedule = {
    hora:  document.getElementById('cfg-schedule-hora').value || '10:00',
    canal: document.getElementById('cfg-schedule-canal').value,
    dias:  [...document.querySelectorAll('.cfg-day:checked')].map(cb => Number(cb.value)),
  };
  await api.post('/api/settings', newSettings);
  settings = newSettings;
  document.getElementById('cfg-save-result').textContent = '✅ Guardado';
  document.getElementById('farmacia-name').textContent = newSettings.farmacia.nombre;
  setTimeout(() => { document.getElementById('cfg-save-result').textContent = ''; }, 2500);
}

async function updateScheduler() {
  const el = document.getElementById('scheduler-result');
  el.textContent = '⏳ Aplicando…';
  const result = await api.post('/api/update-scheduler', {});
  if (result.ok) {
    el.style.color = 'var(--green)';
    el.textContent = '✅ Tarea programada correctamente en Windows';
  } else {
    el.style.color = 'var(--red)';
    el.textContent = `❌ ${result.error}`;
  }
  setTimeout(() => { el.textContent = ''; el.style.color = ''; }, 5000);
}

// ── Test modal ────────────────────────────────────────────────────────────────
function daysFromToday(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}
function todayISO() { return new Date().toISOString().split('T')[0]; }

function openTestModal() {
  document.getElementById('test-phone').value = '';
  document.getElementById('test-result').textContent = '';
  document.getElementById('test-result').style.color = '';
  updateTestPreview();
  openModal('modal-test');
}

function updateTestPreview() {
  const type  = document.getElementById('test-type').value;
  const canal = document.getElementById('test-canal').value;
  const s     = settings;
  if (!s.farmacia) { document.getElementById('test-preview').textContent = 'Carga configuración primero.'; return; }

  const NAME     = s.farmacia.nombre              || 'la farmacia';
  const PHONE    = s.farmacia.telefono            || '';
  const DISCOUNT = s.farmacia.descuento_cumpleanos || '10';
  const expFmt   = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('es-PR', { day:'2-digit', month:'2-digit', year:'numeric' });

  const previews = {
    receta_lista: {
      whatsapp: `Hola Cliente Prueba, su medicamento está listo para recogerse en ${NAME}. Pase por nuestra farmacia o llámenos al ${PHONE} si tiene alguna pregunta.`,
      llamada:  `Hola, le llamamos de ${NAME} para informarle que su medicamento está listo para recogerse. Puede pasar por nuestra farmacia en el horario de atención. Para más información llámenos al ${PHONE}. Gracias.`,
    },
    vencimiento_30d: {
      whatsapp: `Hola Cliente Prueba, te recordamos que tienes $45.00 en crédito disponible en ${NAME} que vence el ${expFmt(daysFromToday(30))}. ¡Visítanos antes de que expire! 🛒`,
      llamada:  `Hola Cliente Prueba, le llamamos de ${NAME}. Le recordamos que tiene 45.00 dólares en crédito disponible que vence el ${expFmt(daysFromToday(30))}. Visítenos antes de que expire. Gracias.`,
    },
    vencimiento_7d: {
      whatsapp: `Hola Cliente Prueba, tu crédito de $45.00 en ${NAME} vence en 7 días (${expFmt(daysFromToday(7))}). ¡No lo dejes ir! Pasa por la tienda o llámanos al ${PHONE}.`,
      llamada:  `Hola Cliente Prueba, le llamamos de ${NAME}. Su crédito de 45.00 dólares vence en 7 días, el ${expFmt(daysFromToday(7))}. No lo deje ir. Pase por la farmacia o llámenos al ${PHONE}. Gracias.`,
    },
    vencimiento_1d: {
      whatsapp: `⚠️ Hola Cliente Prueba, mañana vence tu crédito de $45.00 en ${NAME}. ¡Último día para usarlo! Llámanos al ${PHONE} si necesitas ayuda.`,
      llamada:  `Hola Cliente Prueba, le llamamos de ${NAME} con un recordatorio urgente. Su crédito de 45.00 dólares vence mañana. Es su último día para usarlo. Llámenos al ${PHONE} si necesita ayuda. Gracias.`,
    },
    cumpleanos: {
      whatsapp: `🎂 ¡Feliz cumpleaños, Cliente Prueba! De parte de toda la familia de ${NAME}, te deseamos un día increíble. Como regalo, tienes ${DISCOUNT}% de descuento en tu próxima visita esta semana. ¡Te esperamos!`,
      llamada:  `Hola Cliente Prueba, toda la familia de ${NAME} le desea un muy feliz cumpleaños. Como regalo especial, tiene ${DISCOUNT} por ciento de descuento en su próxima visita esta semana. Que lo disfrute mucho. Gracias.`,
    },
  };

  document.getElementById('test-preview').textContent = previews[type]?.[canal] || '—';
}

async function sendTestMessage() {
  const phone = document.getElementById('test-phone').value.trim();
  const type  = document.getElementById('test-type').value;
  const canal = document.getElementById('test-canal').value;
  const res   = document.getElementById('test-result');

  if (!phone) { res.textContent = '⚠️ Ingresa un número de teléfono.'; return; }

  const btn    = document.getElementById('test-send-btn');
  btn.disabled = true;
  res.textContent = '⏳ Enviando…';

  const result = await api.post('/api/send-test', { phone, type, canal });
  btn.disabled = false;

  if (result.ok) {
    res.style.color = 'var(--green)';
    res.textContent = `✅ Enviado por ${CANAL_LABELS[canal]}.`;
  } else {
    res.style.color = 'var(--red)';
    res.textContent = `❌ ${result.error}`;
  }
}

// ── Audio URL test ────────────────────────────────────────────────────────────
function testAudioUrl() {
  const url = document.getElementById('cfg-recording-url').value.trim();
  const res = document.getElementById('audio-test-result');
  if (!url) { res.textContent = '⚠️ Ingresa una URL primero.'; return; }
  try {
    new URL(url);
    res.style.color = 'var(--green)';
    res.textContent = '✅ Formato válido. Verifica que sea accesible desde un navegador.';
  } catch {
    res.style.color = 'var(--red)';
    res.textContent = '❌ URL inválida.';
  }
}

// ── Modal helpers ─────────────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

// ── Alert helpers ─────────────────────────────────────────────────────────────
function showAlert(id, type, msg) {
  const cls = type === 'error' ? 'alert-error' : type === 'warn' ? 'alert-warn' : 'alert-info';
  document.getElementById(id).innerHTML = `<div class="alert ${cls}">⚠️ ${escHtml(msg)}</div>`;
}
function clearAlert(id) { document.getElementById(id).innerHTML = ''; }

// ── Utilities ─────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatPhone(p) {
  const d = (p || '').replace(/\D/g,'').slice(-10);
  return d.length === 10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : (p || '—');
}
function timeAgo(date) {
  const s = Math.floor((new Date() - date) / 1000);
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.floor(s/60)} min`;
  return `hace ${Math.floor(s/3600)} h`;
}
