// Logger — no Electron dependency. Uses APPDATA directly.

const fs   = require('fs');
const path = require('path');

const USERDATA  = path.join(process.env.APPDATA || require('os').homedir(), 'farmacia-recordatorios');
const LOG_PATH  = path.join(USERDATA, 'sent.log');

function logSent(customer, type, canal, status, error = '') {
  const entry = { ts: new Date().toISOString(), nombre: customer.nombre, telefono: customer.telefono, tipo: type, canal, status, ...(error && { error }) };
  fs.mkdirSync(USERDATA, { recursive: true });
  fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
}

function getHistory(limit = 1000) {
  if (!fs.existsSync(LOG_PATH)) return [];
  const lines = fs.readFileSync(LOG_PATH, 'utf8').trim().split('\n').filter(Boolean);
  return lines.slice(-limit).reverse().map(line => { try { return JSON.parse(line); } catch (e) { return null; } }).filter(Boolean);
}

module.exports = { logSent, getHistory };
