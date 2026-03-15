const { app, BrowserWindow } = require('electron');
const path      = require('path');
const os        = require('os');
const fs        = require('fs');
const express   = require('express');
const { execFile } = require('child_process');
const multer  = require('multer');
const { parse } = require('csv-parse/sync');

const { getSettings, saveSettings }                               = require('./lib/store');
const { testConnection, fetchPrescriptionsReady, fetchAllPatients } = require('./lib/rx30');
const { buildMessages }                                           = require('./lib/messages');
const { sendWhatsApp, makeCall }                                  = require('./lib/sender');
const { logSent, getHistory }                                     = require('./lib/logger');
const { checkForUpdate, downloadUpdate, applyAndRestart }         = require('./lib/updater');

const APP_VERSION = require('./package.json').version;

const PORT   = 3333;
const upload = multer({ storage: multer.memoryStorage() });

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// Sensitive fields never sent to the browser — managed via settings.json only.
const SENSITIVE = {
  twilio: ['account_sid', 'auth_token'],
  rx30:   ['password', 'user', 'server', 'port', 'database'],
};

function safeSettings(s) {
  return {
    farmacia: { ...s.farmacia },
    rx30:     { enabled: !!s.rx30?.enabled },
    twilio:   { recording_receta_url: s.twilio?.recording_receta_url || '' },
    schedule: { ...s.schedule },
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

// SSE broadcast to all connected clients
let sseClients = [];
function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  sseClients = sseClients.filter(res => {
    try { res.write(msg); return true; } catch (e) { return false; }
  });
}

// ─── Express app ──────────────────────────────────────────────────────────────

const api = express();
api.use(express.json({ limit: '10mb' }));
api.use(express.static(path.join(__dirname, 'renderer')));

// Info (used by renderer to show network URL)
api.get('/api/server-info', (req, res) => {
  res.json({ ip: getLocalIP(), port: PORT });
});

// Settings — only non-sensitive fields flow through the API
api.get('/api/settings',  (req, res) => res.json(safeSettings(getSettings())));
api.post('/api/settings', (req, res) => { saveSettings(mergeSecure(req.body)); res.json({ ok: true }); });

// Admin endpoints — require password, allow reading/writing sensitive fields
function checkPassword(req, res) {
  const current = getSettings();
  const expected = current.admin_password || 'farmacia123';
  if (req.body.password !== expected) { res.json({ ok: false, error: 'Contraseña incorrecta.' }); return false; }
  return true;
}
api.post('/api/admin/get-settings', (req, res) => {
  if (!checkPassword(req, res)) return;
  const s = getSettings();
  res.json({ ok: true, twilio: s.twilio });
});
api.post('/api/admin/save-settings', (req, res) => {
  if (!checkPassword(req, res)) return;
  const current = getSettings();
  const updated = { ...current };
  if (req.body.twilio) updated.twilio = { ...current.twilio, ...req.body.twilio };
  if (req.body.new_password) updated.admin_password = req.body.new_password;
  saveSettings(updated);
  res.json({ ok: true });
});

// Rx30 — test uses saved credentials only, never from request body
api.get('/api/test-rx30', async (req, res) => {
  const s = getSettings();
  if (!s.rx30?.server) return res.json({ ok: false, error: 'Rx30 no configurado en settings.json.' });
  res.json(await testConnection(s.rx30));
});

// Updater endpoints
api.get('/api/version', (req, res) => res.json({ version: APP_VERSION }));
api.get('/api/check-update', async (req, res) => res.json(await checkForUpdate(APP_VERSION)));
api.post('/api/apply-update', async (req, res) => {
  try {
    const batPath = await downloadUpdate(__dirname);
    res.json({ ok: true });
    applyAndRestart(batPath, app);
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

api.get('/api/sync-rx30', async (req, res) => {
  const settings = getSettings();
  if (!settings.rx30.enabled || !settings.rx30.server)
    return res.json({ ok: false, error: 'Rx30 no configurado. Ve a Configuración → Rx30.' });
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

// CSV upload (multipart)
api.post('/api/import-csv', upload.single('csv'), (req, res) => {
  try {
    const settings  = getSettings();
    const customers = parseCSVBuffer(req.file.buffer);
    res.json({ ok: true, queue: buildQueue(customers, settings), patientCount: customers.length, filename: req.file.originalname });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

// SSE progress stream
api.get('/api/send-progress', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();
  sseClients.push(res);
  req.on('close', () => { sseClients = sseClients.filter(c => c !== res); });
});

// Send batch
api.post('/api/send-messages', async (req, res) => {
  const { items, canal } = req.body;
  const settings = getSettings();
  let sent = 0, failed = 0;

  for (const item of items) {
    try {
      if (settings.demo_mode) {
        // DEMO MODE — simulate a 600ms delay, no real call/message sent
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

// Windows Task Scheduler — create/update the auto-send task
api.post('/api/update-scheduler', (req, res) => {
  const s = getSettings();
  const { hora, dias, canal } = s.schedule || {};
  if (!hora || !dias?.length) return res.json({ ok: false, error: 'Configura hora y días antes de aplicar.' });

  const DAY_MAP = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const daysStr = dias.map(d => DAY_MAP[d]).join(',');
  const batPath = path.join(__dirname, 'auto-send.bat');

  execFile('schtasks', [
    '/create', '/f',
    '/tn', 'FarmaciaRecordatorios',
    '/tr', `"${batPath}"`,
    '/sc', 'WEEKLY',
    '/d', daysStr,
    '/st', hora,
  ], (err, stdout, stderr) => {
    if (err) return res.json({ ok: false, error: stderr || err.message });
    res.json({ ok: true });
  });
});

// History
api.get('/api/history', (req, res) => res.json(getHistory()));

// Test message
api.post('/api/send-test', async (req, res) => {
  const { phone, type, canal } = req.body;
  const settings = getSettings();
  const today    = new Date();
  const pad      = n => String(n).padStart(2, '0');
  const iso      = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const add      = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return iso(d); };

  const synth = {
    nombre:            'Cliente Prueba',
    telefono:          phone.replace(/\D/g, '').slice(-10),
    receta_lista:      type === 'receta_lista'        ? '1'       : '0',
    fecha_nacimiento:  type === 'cumpleanos'           ? iso(today): null,
    saldo:             type.startsWith('vencimiento')  ? '45.00'   : null,
    fecha_vencimiento: type === 'vencimiento_30d'      ? add(30)
                     : type === 'vencimiento_7d'       ? add(7)
                     : type === 'vencimiento_1d'       ? add(1)    : null,
  };

  const msg = buildMessages(synth, settings).find(m => m.type === type);
  if (!msg) return res.json({ ok: false, error: `Tipo '${type}' no generó mensaje.` });

  try {
    if (settings.demo_mode) {
      // DEMO MODE — no real call/message sent
    } else if (canal === 'llamada') {
      await makeCall(synth.telefono, msg.script, settings);
    } else {
      await sendWhatsApp(synth.telefono, msg.body, settings);
    }
    res.json({ ok: true, preview: canal === 'llamada' ? msg.script : msg.body, demo: !!settings.demo_mode });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// ─── Start server + Electron window ───────────────────────────────────────────

app.whenReady().then(() => {
  api.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  Farmacia Recordatorios corriendo en:`);
    console.log(`  Local:  http://localhost:${PORT}`);
    console.log(`  Red:    http://${getLocalIP()}:${PORT}\n`);
  });

  // Give Express a moment to bind before loading the window
  setTimeout(() => {
    const win = new BrowserWindow({
      width: 1140, height: 740,
      minWidth: 920, minHeight: 620,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
      title: `Farmacia Recordatorios  ·  Red: http://${getLocalIP()}:${PORT}`,
    });
    win.loadURL(`http://localhost:${PORT}`);
    win.setMenuBarVisibility(false);
  }, 600);
});

app.on('window-all-closed', () => app.quit());
