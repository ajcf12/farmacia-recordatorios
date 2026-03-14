// Settings stored as JSON in Electron's userData directory.
// All getPath() calls are lazy — only invoked after app is ready.

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  farmacia: {
    nombre: 'la farmacia',
    telefono: '',
    descuento_cumpleanos: '10',
  },
  rx30: {
    server: '',
    port: 1433,
    database: 'RX30',
    user: '',
    password: '',
    enabled: false,
  },
  twilio: {
    account_sid: '',
    auth_token: '',
    whatsapp_from: '+14155238886',
    call_from: '',
    recording_receta_url: '',
  },
  schedule: {
    hora:  '10:00',
    dias:  [1, 2, 3, 4, 5, 6],   // 0=Dom 1=Lun … 6=Sáb
    canal: 'llamada',
  },
};

function getSettingsPath() {
  const { app } = require('electron');
  return path.join(app.getPath('userData'), 'settings.json');
}

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
    const p = getSettingsPath();
    if (fs.existsSync(p)) {
      return deepMerge(DEFAULTS, JSON.parse(fs.readFileSync(p, 'utf8')));
    }
  } catch (e) {}
  return JSON.parse(JSON.stringify(DEFAULTS));
}

function saveSettings(settings) {
  const p = getSettingsPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(settings, null, 2));
}

module.exports = { getSettings, saveSettings };
