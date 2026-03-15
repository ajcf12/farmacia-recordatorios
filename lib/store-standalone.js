// Settings store — no Electron dependency. Uses APPDATA directly.

const fs   = require('fs');
const path = require('path');

const USERDATA = path.join(process.env.APPDATA || require('os').homedir(), 'farmacia-recordatorios');
const SETTINGS_PATH = path.join(USERDATA, 'settings.json');

const DEFAULTS = {
  farmacia: { nombre: 'la farmacia', telefono: '', descuento_cumpleanos: '10' },
  rx30:     { server: '', port: 1433, database: 'RX30', user: '', password: '', enabled: false },
  twilio:   { account_sid: '', auth_token: '', whatsapp_from: '', call_from: '', recording_receta_url: '' },
  schedule: { hora: '10:00', dias: [1,2,3,4,5,6], canal: 'llamada' },
};

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source || {})) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function getSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) return deepMerge(DEFAULTS, JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')));
  } catch (e) {}
  return JSON.parse(JSON.stringify(DEFAULTS));
}

function saveSettings(settings) {
  fs.mkdirSync(USERDATA, { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

module.exports = { getSettings, saveSettings };
