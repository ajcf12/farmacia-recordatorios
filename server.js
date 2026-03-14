// Standalone Express server — no Electron required.
// Double-click the compiled exe; browser opens automatically.

const path    = require('path');
const os      = require('os');
const fs      = require('fs');
const express = require('express');
const multer  = require('multer');
const { parse } = require('./node_modules/csv-parse/dist/cjs/sync.cjs');
const { execSync, exec } = require('child_process');

const { getSettings, saveSettings }                                = require('./lib/store-standalone');
const { testConnection, fetchPrescriptionsReady, fetchAllPatients } = require('./lib/rx30');
const { buildMessages }                                            = require('./lib/messages');
const { sendWhatsApp, makeCall }                                   = require('./lib/sender');
const { logSent, getHistory }                                      = require('./lib/logger-standalone');

const PORT   = 3333;
const upload = multer({ storage: multer.memoryStorage() });

function getLocalIP() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of (ifaces || [])) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

function buildQueue(customers, settings) {
  const queue = [];
  for (const c of customers) {
    for (const msg of buildMessages(c, settings)) {
      queue.push({ ...msg, nombre: c.nombre, telefono: c.telefono });
    }
  }
  return queue;
}

function parseCSVBuffer(buffer) {
  const records = parse(buffer.toString('utf8'), { columns: true, skip_empty_lines: true, trim: true });
  return records.map(r => ({
    nombre:            r.nombre            || r.Nombre            || '',
    telefono:         (r.telefono          || r.Telefono          || '').replace(/\D/g,'').slice(-10),
    fecha_nacimiento:  r.fecha_nacimiento   || r.FechaNacimiento   || null,
    saldo:             r.saldo              || r.Saldo              || null,
    fecha_vencimiento: r.fecha_vencimiento  || r.FechaVencimiento  || null,
    receta_lista:      r.receta_lista       || r.RecetaLista       || '0',
  }));
}

const SENSITIVE = { twilio: ['account_sid','auth_token'], rx30: ['password','user','server','port','database'] };

function safeSettings(s) {
  return {
    farmacia:  { ...s.farmacia },
    rx30:      { enabled: !!s.rx30?.enabled },
    twilio:    { recording_receta_url: s.twilio?.recording_receta_url || '' },
    schedule:  { ...s.schedule },
    demo_mode: !!s.demo_mode,
  };
}

function mergeSecure(incoming) {
  const current = getSettings();
  return {
    farmacia: { ...current.farmacia, ...incoming.farmacia },
    rx30:     { ...current.rx30,     enabled: !!incoming.rx30?.enabled },
    twilio:   { ...current.twilio,   recording_receta_url: incoming.twilio?.recording_receta_url ?? current.twilio?.recording_receta_url },
    schedule: incoming.schedule ? { ...current.schedule, ...incoming.schedule } : current.schedule,
  };
}

let sseClients = [];
function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  sseClients = sseClients.filter(res => { try { res.write(msg); return true; } catch (e) { return false; } });
}

// ── Express ────────────────────────────────────────────────────────────────────

const api = express();
api.use(express.json({ limit: '10mb' }));

// Serve renderer — always from same directory as the exe/script
const rendererPath = path.join(
  process.pkg ? path.dirname(process.execPath) : __dirname,
  'renderer'
);
api.use(express.static(rendererPath));

api.get('/api/server-info', (req, res) => res.json({ ip: getLocalIP(), port: PORT }));
api.get('/api/settings',   (req, res) => res.json(safeSettings(getSettings())));
api.post('/api/settings',  (req, res) => { saveSettings(mergeSecure(req.body)); res.json({ ok: true }); });

api.get('/api/test-rx30', async (req, res) => {
  const s = getSettings();
  if (!s.rx30?.server) return res.json({ ok: false, error: 'Rx30 no configurado en settings.json.' });
  res.json(await testConnection(s.rx30));
});

api.get('/api/sync-rx30', async (req, res) => {
  const settings = getSettings();
  if (!settings.rx30.enabled || !settings.rx30.server)
    return res.json({ ok: false, error: 'Rx30 no configurado.' });
  try {
    const customers = await fetchPrescriptionsReady(settings.rx30);
    res.json({ ok: true, queue: buildQueue(customers, settings), patientCount: customers.length, synced: new Date().toISOString() });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

api.get('/api/clientes', async (req, res) => {
  const settings = getSettings();
  if (!settings.rx30.enabled || !settings.rx30.server)
    return res.json({ ok: false, error: 'Rx30 no configurado.' });
  try {
    res.json({ ok: true, patients: await fetchAllPatients(settings.rx30) });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

api.post('/api/import-csv', upload.single('csv'), (req, res) => {
  try {
    const settings  = getSettings();
    const customers = parseCSVBuffer(req.file.buffer);
    res.json({ ok: true, queue: buildQueue(customers, settings), patientCount: customers.length, filename: req.file.originalname });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

api.get('/api/send-progress', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();
  sseClients.push(res);
  req.on('close', () => { sseClients = sseClients.filter(c => c !== res); });
});

api.post('/api/send-messages', async (req, res) => {
  const { items, canal } = req.body;
  const settings = getSettings();
  let sent = 0, failed = 0;
  for (const item of items) {
    try {
      if (settings.demo_mode) {
        await new Promise(r => setTimeout(r, 600));
      } else if (canal === 'llamada') {
        await makeCall(item.telefono, item.script, settings);
        await new Promise(r => setTimeout(r, 3000));
      } else {
        await sendWhatsApp(item.telefono, item.body, settings);
      }
      logSent({ nombre: item.nombre, telefono: item.telefono }, item.type, canal, settings.demo_mode ? 'demo' : 'ok');
      sent++;
      broadcast({ nombre: item.nombre, status: 'ok', sent, total: items.length });
    } catch (err) {
      logSent({ nombre: item.nombre, telefono: item.telefono }, item.type, canal, 'error', err.message);
      failed++;
      broadcast({ nombre: item.nombre, status: 'error', error: err.message, sent, total: items.length });
    }
  }
  res.json({ ok: true, sent, failed });
});

api.get('/api/history', (req, res) => res.json(getHistory()));

api.post('/api/send-test', async (req, res) => {
  const { phone, type, canal } = req.body;
  const settings = getSettings();
  const today = new Date();
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const add = n => { const d = new Date(today); d.setDate(d.getDate()+n); return iso(d); };
  const synth = {
    nombre: 'Cliente Prueba', telefono: phone.replace(/\D/g,'').slice(-10),
    receta_lista: type === 'receta_lista' ? '1' : '0',
    fecha_nacimiento: type === 'cumpleanos' ? iso(today) : null,
    saldo: type.startsWith('vencimiento') ? '45.00' : null,
    fecha_vencimiento: type === 'vencimiento_30d' ? add(30) : type === 'vencimiento_7d' ? add(7) : type === 'vencimiento_1d' ? add(1) : null,
  };
  const msg = buildMessages(synth, settings).find(m => m.type === type);
  if (!msg) return res.json({ ok: false, error: `Tipo '${type}' no generó mensaje.` });
  try {
    if (!settings.demo_mode) {
      if (canal === 'llamada') await makeCall(synth.telefono, msg.script, settings);
      else await sendWhatsApp(synth.telefono, msg.body, settings);
    }
    res.json({ ok: true, preview: canal === 'llamada' ? msg.script : msg.body, demo: !!settings.demo_mode });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

// ── Start ──────────────────────────────────────────────────────────────────────

api.listen(PORT, '0.0.0.0', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n  Farmacia Recordatorios corriendo en:`);
  console.log(`  Local:  ${url}`);
  console.log(`  Red:    http://${getLocalIP()}:${PORT}\n`);
  // Auto-open browser
  exec(`start ${url}`);
});
