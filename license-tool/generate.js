// OWNER TOOL — generate a license code for a customer's Machine ID.
// Usage:  node generate.js A1B2-C3D4-E5F6-7890
// Requires PRIVATE-KEY-KEEP-SECRET.pem in this folder (your master secret).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const machineId = (process.argv[2] || '').trim();
if (!machineId) {
  console.log('Usage: node generate.js <MACHINE-ID>');
  console.log('Example: node generate.js A1B2-C3D4-E5F6-7890');
  process.exit(1);
}
const keyPath = path.join(__dirname, 'PRIVATE-KEY-KEEP-SECRET.pem');
if (!fs.existsSync(keyPath)) {
  console.log('ERROR: PRIVATE-KEY-KEEP-SECRET.pem not found in this folder.');
  process.exit(1);
}
const priv = fs.readFileSync(keyPath);
const sig = crypto.sign(null, Buffer.from(machineId), priv);
console.log('\n=== LICENSE CODE for Machine ID ' + machineId + ' ===\n');
console.log(sig.toString('base64'));
console.log('\nSend this code to the customer. It only works on that one machine.\n');
