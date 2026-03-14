// Append-only JSONL send log in userData directory.

const fs = require('fs');
const path = require('path');

function getLogPath() {
  const { app } = require('electron');
  return path.join(app.getPath('userData'), 'sent.log');
}

function logSent(customer, type, canal, status, error = '') {
  const entry = {
    ts: new Date().toISOString(),
    nombre: customer.nombre,
    telefono: customer.telefono,
    tipo: type,
    canal,
    status,
    error,
  };
  fs.appendFileSync(getLogPath(), JSON.stringify(entry) + '\n');
}

function getHistory(limit = 1000) {
  const p = getLogPath();
  if (!fs.existsSync(p)) return [];
  const lines = fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean);
  return lines
    .slice(-limit)
    .reverse()
    .map(line => { try { return JSON.parse(line); } catch (e) { return null; } })
    .filter(Boolean);
}

module.exports = { logSent, getHistory };
