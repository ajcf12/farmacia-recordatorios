// Settings stored encrypted in Electron's userData directory.
// Uses Electron safeStorage (Windows DPAPI / macOS Keychain) — tied to OS user account.
// All getPath() / safeStorage calls are lazy — only invoked after app is ready.

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  farmacia: {
    nombre: '',
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
    whatsapp_from: '',
    call_from: '',
    recording_receta_url: '',
  },
  schedule: {
    hora:  '10:00',
    dias:  [1, 2, 3, 4, 5, 6],
    canal: 'llamada',
  },
};

function getDir() {
  const { app } = require('electron');
  return app.getPath('userData');
}

function getEncPath()  { return path.join(getDir(), 'settings.enc'); }
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
  const { safeStorage } = require('electron');
  const encPath  = getEncPath();
  const jsonPath = getJsonPath();

  try {
    // Prefer encrypted file
    if (fs.existsSync(encPath) && safeStorage.isEncryptionAvailable()) {
      const buf = fs.readFileSync(encPath);
      const json = safeStorage.decryptBuffer(buf).toString('utf8');
      return deepMerge(DEFAULTS, JSON.parse(json));
    }

    // Fall back to plain JSON (first run or legacy) — migrate automatically
    if (fs.existsSync(jsonPath)) {
      const parsed = deepMerge(DEFAULTS, JSON.parse(fs.readFileSync(jsonPath, 'utf8')));
      saveSettings(parsed); // re-save encrypted
      return parsed;
    }
  } catch (e) {}

  return JSON.parse(JSON.stringify(DEFAULTS));
}

function saveSettings(settings) {
  const { safeStorage } = require('electron');
  const dir = getDir();
  fs.mkdirSync(dir, { recursive: true });

  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(JSON.stringify(settings));
    fs.writeFileSync(getEncPath(), encrypted);
    // Remove plain-text file if it exists
    const jsonPath = getJsonPath();
    if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
  } else {
    // Fallback if OS encryption unavailable (shouldn't happen on Windows 10+)
    fs.writeFileSync(getJsonPath(), JSON.stringify(settings, null, 2));
  }
}

module.exports = { getSettings, saveSettings };
