// Auto-updater — checks GitHub for a newer version and applies it on user approval.
// Flow: check version → download ZIP → write update.bat → exit app → bat copies files + relaunches

const https    = require('https');
const http     = require('http');
const fs       = require('fs');
const path     = require('path');
const os       = require('os');
const { execFile } = require('child_process');

const REPO        = 'ajcf12/farmacia-recordatorios';
const RAW_PKG_URL = `https://raw.githubusercontent.com/${REPO}/main/app/package.json`;
const ZIP_URL     = `https://github.com/${REPO}/archive/refs/heads/main.zip`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function get(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    if (redirects === 0) return reject(new Error('Too many redirects'));
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
        return resolve(get(res.headers.location, redirects - 1));
      }
      resolve(res);
    }).on('error', reject);
  });
}

function fetchText(url) {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await get(url);
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    } catch (e) { reject(e); }
  });
}

function downloadFile(url, dest) {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await get(url);
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    } catch (e) { reject(e); }
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function checkForUpdate(currentVersion) {
  try {
    const text   = await fetchText(RAW_PKG_URL);
    const remote = JSON.parse(text);
    if (remote.version && remote.version !== currentVersion) {
      return { hasUpdate: true, remoteVersion: remote.version };
    }
    return { hasUpdate: false };
  } catch (_) {
    return { hasUpdate: false }; // no internet / error — silently skip
  }
}

// Downloads the update ZIP and stages an update.bat in %TEMP%.
// Returns the bat path to run after app exits.
async function downloadUpdate(appDir) {
  const tmpZip = path.join(os.tmpdir(), 'farmacia-update.zip');
  const tmpDir = path.join(os.tmpdir(), 'farmacia-update');
  const batPath = path.join(os.tmpdir(), 'farmacia-do-update.bat');

  // 1. Download ZIP
  await downloadFile(ZIP_URL, tmpZip);

  // 2. Extract via PowerShell (built into Windows, no deps needed)
  await new Promise((resolve, reject) => {
    const cmd = [
      `if (Test-Path '${tmpDir}') { Remove-Item '${tmpDir}' -Recurse -Force }`,
      `Expand-Archive -Path '${tmpZip}' -DestinationPath '${tmpDir}' -Force`,
    ].join('; ');
    execFile('powershell', ['-NoProfile', '-Command', cmd], err =>
      err ? reject(err) : resolve()
    );
  });

  // 3. Write the update.bat that runs after the app exits
  //    - waits for app to close
  //    - robocopy new files over (skipping node_modules and data)
  //    - npm install (in case dependencies changed)
  //    - relaunches the app
  const srcDir = path.join(tmpDir, 'farmacia-recordatorios-main');
  const bat = [
    '@echo off',
    'timeout /t 3 /nobreak > nul',
    `robocopy "${srcDir}" "${appDir}" /E /XD node_modules data /XF *.log /NFL /NDL /NJH /NJS > nul`,
    `cd /d "${appDir}"`,
    'npm install --quiet --prefer-offline 2> nul',
    `start "" "${path.join(appDir, 'START.bat')}"`,
  ].join('\r\n');

  fs.writeFileSync(batPath, bat);
  return batPath;
}

// Runs the staged bat detached then exits the Electron app.
function applyAndRestart(batPath, electronApp) {
  execFile('cmd', ['/c', 'start', '', '/min', batPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  electronApp.exit(0);
}

module.exports = { checkForUpdate, downloadUpdate, applyAndRestart };
