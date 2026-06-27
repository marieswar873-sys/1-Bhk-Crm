// Machine-locked offline licensing.
// The app carries only the PUBLIC key. License codes are signatures of this machine's
// ID, created by the owner's PRIVATE key (kept secret, never shipped). A code only
// verifies on the exact machine it was issued for — so the app can't be copied/resold.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA4aK0aqcudIyXFowtQu4lrcXUxV04OBj1y/9HplcEV6Y=
-----END PUBLIC KEY-----`;

function rawMachineId() {
  try {
    const out = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid', { windowsHide: true }).toString();
    const m = out.match(/MachineGuid\s+REG_SZ\s+([\w-]+)/i);
    if (m) return m[1];
  } catch {}
  return os.hostname() + '|' + ((os.cpus()[0] || {}).model || 'cpu');
}

// Short, human-readable machine fingerprint shown to the customer.
function machineId() {
  const hash = crypto.createHash('sha256').update('1BHK-CRM|' + rawMachineId()).digest('hex').toUpperCase();
  return hash.slice(0, 16).match(/.{1,4}/g).join('-'); // e.g. A1B2-C3D4-E5F6-7890
}

function verifyCode(code) {
  try {
    const sig = Buffer.from(String(code).replace(/\s+/g, ''), 'base64');
    return crypto.verify(null, Buffer.from(machineId()), PUBLIC_KEY, sig);
  } catch { return false; }
}

let licenseFile = null;
function init(userDataDir) { licenseFile = path.join(userDataDir, 'license.dat'); }

function isLicensed() {
  try {
    if (!licenseFile || !fs.existsSync(licenseFile)) return false;
    return verifyCode(fs.readFileSync(licenseFile, 'utf8'));
  } catch { return false; }
}

function activate(code) {
  if (!verifyCode(code)) return false;
  try { fs.writeFileSync(licenseFile, String(code).trim()); return true; } catch { return false; }
}

module.exports = { init, machineId, isLicensed, activate };
