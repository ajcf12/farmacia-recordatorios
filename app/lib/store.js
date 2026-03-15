// Settings stored in Electron's userData directory as plain JSON.
// Path: %APPDATA%\farmacia-recordatorios\settings.json
// Protected by the OS user account — only the logged-in Windows user can read it.

const fs   = require('fs');
const path = require('path');

const DEFAULTS = {
  farmacia: {
    nombre: '',
    telefono: '',
    descuento_cumpleanos: '10',
  },
  rx30: {
    server:   '',
    port:     1433,
    database: 'RX30',
    user:     '',
    password: '',
    enabled:  false,
  },
  twilio: {
    account_sid:          '',
    auth_token:           '',
    whatsapp_from:        '',
    call_from:            '',
    recording_receta_url: '',
  },
  schedule: {
    hora:  '10:00',
    dias:  [1, 2, 3, 4, 5, 6],
    canal: 'llamada',
  },
  demo_mode: true,
};

function getDir() {
  const { app } = require('electron');
  return app.getPath('userData');
}

function getJsonPath() { return path.join(getDir(), 'settings.json'); }

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
  const jsonPath = getJsonPath();
  try {
    if (fs.existsSync(jsonPath)) {
      return deepMerge(DEFAULTS, JSON.parse(fs.readFileSync(jsonPath, 'utf8')));
    }
  } catch (e) {
    console.error('[store] Error reading settings.json:', e.message);
  }
  return JSON.parse(JSON.stringify(DEFAULTS));
}

function saveSettings(settings) {
  const dir = getDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getJsonPath(), JSON.stringify(settings, null, 2), 'utf8');
}

module.exports = { getSettings, saveSettings };
