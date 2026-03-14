// Headless auto-sender — called by Windows Task Scheduler.
// No Electron dependency. Reads settings.json directly from AppData.

const fs   = require('fs');
const path = require('path');

const USERDATA      = path.join(process.env.APPDATA || require('os').homedir(), 'farmacia-recordatorios');
const SETTINGS_PATH = path.join(USERDATA, 'settings.json');
const SENT_LOG      = path.join(USERDATA, 'sent.log');
const RUN_LOG       = path.join(USERDATA, 'auto-send.log');

function runLog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(RUN_LOG, line + '\n'); } catch (e) {}
}

function logSent(customer, type, canal, status, error = '') {
  const entry = {
    ts: new Date().toISOString(),
    nombre: customer.nombre,
    telefono: customer.telefono,
    tipo: type,
    canal,
    status,
    ...(error && { error }),
  };
  try { fs.appendFileSync(SENT_LOG, JSON.stringify(entry) + '\n'); } catch (e) {}
}

function loadSettings() {
  if (!fs.existsSync(SETTINGS_PATH)) throw new Error('settings.json no encontrado: ' + SETTINGS_PATH);
  return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
}

async function main() {
  fs.mkdirSync(USERDATA, { recursive: true });
  runLog('=== Auto-envío iniciado ===');

  let settings;
  try { settings = loadSettings(); } catch (e) { runLog('ERROR: ' + e.message); process.exit(1); }

  if (settings.demo_mode) {
    runLog('Modo demostración activo — no se envía nada. Saliendo.');
    return;
  }

  // Check scheduled day
  const today = new Date().getDay(); // 0=Dom … 6=Sáb
  const dias  = settings.schedule?.dias ?? [1, 2, 3, 4, 5, 6];
  if (!dias.includes(today)) {
    runLog(`Día ${today} no está en la programación [${dias}]. Saliendo.`);
    return;
  }

  if (!settings.rx30?.enabled || !settings.rx30?.server) {
    runLog('Rx30 no configurado o no habilitado. Saliendo.');
    process.exit(1);
  }

  const { fetchPrescriptionsReady } = require('./lib/rx30');
  const { buildMessages }           = require('./lib/messages');
  const { sendWhatsApp, makeCall }  = require('./lib/sender');

  let customers;
  try {
    runLog('Conectando a Rx30...');
    customers = await fetchPrescriptionsReady(settings.rx30);
    runLog(`${customers.length} paciente(s) con mensajes hoy.`);
  } catch (e) {
    runLog('ERROR Rx30: ' + e.message);
    process.exit(1);
  }

  const queue = [];
  for (const c of customers) {
    for (const msg of buildMessages(c, settings)) {
      queue.push({ ...msg, nombre: c.nombre, telefono: c.telefono });
    }
  }
  runLog(`${queue.length} mensaje(s) a enviar.`);

  const canal = settings.schedule?.canal || 'llamada';
  let sent = 0, failed = 0;

  for (const item of queue) {
    try {
      if (canal === 'llamada') {
        await makeCall(item.telefono, item.script, settings);
        await new Promise(r => setTimeout(r, 3000));
      } else {
        await sendWhatsApp(item.telefono, item.body, settings);
      }
      logSent({ nombre: item.nombre, telefono: item.telefono }, item.type, canal, 'ok');
      runLog(`✅ ${item.nombre} — ${item.type}`);
      sent++;
    } catch (e) {
      logSent({ nombre: item.nombre, telefono: item.telefono }, item.type, canal, 'error', e.message);
      runLog(`❌ ${item.nombre} — ${e.message}`);
      failed++;
    }
  }

  runLog(`=== Listo. Enviados: ${sent} | Fallidos: ${failed} ===`);
}

main().catch(e => { runLog('FATAL: ' + e.message); process.exit(1); });
